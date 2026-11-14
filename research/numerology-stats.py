#!/usr/bin/env python3
"""Research-only calendar study. No orders, no broker, no wallet.

Compares close-to-close session returns on selected calendar days and
date-digit sums with every other session of the same Yahoo series.

Run from the repo root:

    python3 research/numerology-stats.py

Needs numpy and scipy (Welch t-test and exact binomial test).
Writes research/numerology-results.md next to this file.
"""

from __future__ import annotations

import json
import math
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import numpy as np
from scipy import stats

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/122.0.0.0 Safari/537.36"
)
HOSTS = (
    "https://query1.finance.yahoo.com",
    "https://query2.finance.yahoo.com",
)
OUT_PATH = Path(__file__).resolve().parent / "numerology-results.md"

# Calendar day 33 cannot occur. It is kept in NUMBERS so the report can say so.
NUMBERS = (7, 11, 22, 28, 29, 33)
CALENDAR_DAYS = (7, 11, 22, 28, 29)
CONTROL_DAYS = (5, 13, 19, 26)
SUMS = (7, 11, 22, 28, 29, 33)
CRASH_DAYS = frozenset({7, 11, 22, 28, 29})
CRASH_SUMS = frozenset({7, 11, 22, 28, 29, 33})
WORST_N = 25
HOURLY_DAY = date(2026, 11, 8)

INSTRUMENTS = (
    {"symbol": "BTC-USD", "label": "Bitcoin", "short": "BTC"},
    {"symbol": "CL=F", "label": "WTI crude", "short": "WTI"},
    {"symbol": "GC=F", "label": "Gold", "short": "Gold"},
    {"symbol": "^GSPC", "label": "S&P 500", "short": "S&P"},
)


@dataclass
class Session:
    day: date
    ret: float
    abs_ret: float
    range_pct: float
    close: float
    prev_close: float


@dataclass
class TestRow:
    market: str
    symbol: str
    kind: str  # A, B, control
    number: int
    n: int
    mean: float
    up_pct: float
    abs_mean: float
    range_mean: float
    other_n: int
    other_mean: float
    other_up: float
    other_abs: float
    other_range: float
    p_ret: float | None
    p_abs: float | None
    p_less: float | None
    p_greater: float | None


def date_sum(day: date) -> int:
    """Day + month + each digit of the year.

    10 Nov 2026 = 10 + 11 + 2+0+2+6 = 31.
    8 Nov 2026 = 8 + 11 + 2+0+2+6 = 29.
    """
    return day.day + day.month + sum(int(ch) for ch in str(day.year))


def fetch_chart(symbol: str, params: dict[str, Any]) -> dict[str, Any]:
    query = urllib.parse.urlencode(params)
    path = "/v8/finance/chart/" + urllib.parse.quote(symbol, safe="") + "?" + query
    last_error: Exception | None = None
    for attempt in range(3):
        for host in HOSTS:
            url = host + path
            request = urllib.request.Request(
                url,
                headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
            )
            try:
                with urllib.request.urlopen(request, timeout=120) as response:
                    payload = json.loads(response.read().decode("utf-8"))
            except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError) as exc:
                last_error = exc
                continue
            error = (payload.get("chart") or {}).get("error")
            result = (payload.get("chart") or {}).get("result")
            if error or not result:
                last_error = RuntimeError(f"{symbol} chart error: {error or 'empty result'}")
                continue
            return payload
        time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"{symbol} feed failed: {last_error}")


def parse_bars(payload: dict[str, Any]) -> tuple[str, list[dict[str, Any]]]:
    result = payload["chart"]["result"][0]
    meta = result["meta"]
    tz_name = meta.get("exchangeTimezoneName") or "UTC"
    zone = ZoneInfo(tz_name)
    stamps = result.get("timestamp") or []
    quote = result["indicators"]["quote"][0]
    bars: dict[int, dict[str, Any]] = {}
    for i, stamp in enumerate(stamps):
        open_ = quote["open"][i]
        high = quote["high"][i]
        low = quote["low"][i]
        close = quote["close"][i]
        if None in (open_, high, low, close):
            continue
        if not all(math.isfinite(v) for v in (open_, high, low, close)):
            continue
        if high < low:
            continue
        bars[int(stamp)] = {
            "ts": int(stamp),
            "date": datetime.fromtimestamp(int(stamp), zone).date(),
            "open": float(open_),
            "high": float(high),
            "low": float(low),
            "close": float(close),
        }
    ordered = [bars[key] for key in sorted(bars)]
    return tz_name, ordered


def load_daily(symbol: str) -> tuple[str, list[dict[str, Any]], str]:
    """Full daily history.

    Yahoo's range=max chart is downsampled (monthly or coarser). The daily
    series is the period1/period2 request. period1=0 starts at 1970, so
    pre-1970 history uses the negative firstTradeDate and, if one response
    is truncated, a second window from the Unix epoch.
    """
    probe = fetch_chart(symbol, {"range": "5d", "interval": "1d"})
    meta = probe["chart"]["result"][0]["meta"]
    first_trade = meta.get("firstTradeDate")
    period2 = int(time.time()) + 3600
    period1 = int(first_trade) if first_trade is not None else 0
    payload = fetch_chart(
        symbol,
        {"period1": period1, "period2": period2, "interval": "1d"},
    )
    tz_name, bars = parse_bars(payload)
    note = "one request"
    if first_trade is not None and bars:
        first_expected = datetime.fromtimestamp(int(first_trade), ZoneInfo(tz_name)).date()
        if (bars[0]["date"] - first_expected).days > 10 and period1 < 0:
            older = fetch_chart(
                symbol,
                {"period1": period1, "period2": 0, "interval": "1d"},
            )
            newer = fetch_chart(
                symbol,
                {"period1": 0, "period2": period2, "interval": "1d"},
            )
            _, old_bars = parse_bars(older)
            _, new_bars = parse_bars(newer)
            merged: dict[int, dict[str, Any]] = {}
            for bar in old_bars + new_bars:
                merged[bar["ts"]] = bar
            bars = [merged[key] for key in sorted(merged)]
            note = "split at Unix epoch because a single window was truncated"
    return tz_name, bars, note


def sessions_from_bars(bars: list[dict[str, Any]], positive_only: bool) -> tuple[list[Session], list[dict[str, Any]]]:
    """Close-to-close percent from the previous session.

    A percent return needs a positive previous close. A non-positive close
    (WTI on 2020-04-20) is dropped, and the next session is dropped too,
    because its previous close is non-positive. The chain does not jump
    across that gap.
    """
    kept: list[Session] = []
    dropped: list[dict[str, Any]] = []
    for prev, cur in zip(bars, bars[1:]):
        prev_close = prev["close"]
        close = cur["close"]
        if prev_close == 0 or not math.isfinite(prev_close) or not math.isfinite(close):
            dropped.append({**cur, "prev_close": prev_close, "reason": "non-finite or zero previous"})
            continue
        if positive_only and (prev_close <= 0 or close <= 0):
            dropped.append({**cur, "prev_close": prev_close, "reason": "non-positive price"})
            continue
        ret = (close - prev_close) / prev_close * 100.0
        kept.append(
            Session(
                day=cur["date"],
                ret=ret,
                abs_ret=abs(ret),
                range_pct=(cur["high"] - cur["low"]) / prev_close * 100.0,
                close=close,
                prev_close=prev_close,
            )
        )
    return kept, dropped


def mean(values: list[float]) -> float:
    return float(np.mean(values)) if values else float("nan")


def up_pct(values: list[float]) -> float:
    if not values:
        return float("nan")
    return 100.0 * sum(1 for value in values if value > 0) / len(values)


def welch(group: list[float], other: list[float]) -> tuple[float | None, float | None, float | None]:
    """Two-sided, less, and greater p-values. group vs other."""
    if len(group) < 2 or len(other) < 2:
        return None, None, None
    if float(np.std(group, ddof=1)) == 0.0 and float(np.std(other, ddof=1)) == 0.0:
        return None, None, None
    two = stats.ttest_ind(group, other, equal_var=False, alternative="two-sided")
    less = stats.ttest_ind(group, other, equal_var=False, alternative="less")
    greater = stats.ttest_ind(group, other, equal_var=False, alternative="greater")
    return _finite_p(two.pvalue), _finite_p(less.pvalue), _finite_p(greater.pvalue)


def _finite_p(value: Any) -> float | None:
    number = float(value)
    if not math.isfinite(number):
        return None
    return number


def slice_stats(rows: list[Session], mask: list[bool], market: str, symbol: str, kind: str, number: int) -> TestRow:
    group = [row for row, keep in zip(rows, mask) if keep]
    other = [row for row, keep in zip(rows, mask) if not keep]
    p_ret, p_less, p_greater = welch([row.ret for row in group], [row.ret for row in other])
    p_abs, _, _ = welch([row.abs_ret for row in group], [row.abs_ret for row in other])
    return TestRow(
        market=market,
        symbol=symbol,
        kind=kind,
        number=number,
        n=len(group),
        mean=mean([row.ret for row in group]),
        up_pct=up_pct([row.ret for row in group]),
        abs_mean=mean([row.abs_ret for row in group]),
        range_mean=mean([row.range_pct for row in group]),
        other_n=len(other),
        other_mean=mean([row.ret for row in other]),
        other_up=up_pct([row.ret for row in other]),
        other_abs=mean([row.abs_ret for row in other]),
        other_range=mean([row.range_pct for row in other]),
        p_ret=p_ret,
        p_abs=p_abs,
        p_less=p_less,
        p_greater=p_greater,
    )


def bonferroni(p: float | None, m: int) -> float | None:
    if p is None:
        return None
    return min(1.0, p * m)


def fmt(value: float | None, digits: int = 4) -> str:
    if value is None or not math.isfinite(value):
        return "n/a"
    return f"{value:.{digits}f}"


def fmt_p(value: float | None) -> str:
    if value is None or not math.isfinite(value):
        return "n/a"
    if value < 1e-4:
        return f"{value:.2e}"
    return f"{value:.4f}"


def fmt_px(value: float) -> str:
    return f"{value:,.2f}"


def table(headers: list[str], rows: list[list[str]]) -> list[str]:
    out = [
        "| " + " | ".join(headers) + " |",
        "| " + " | ".join("---" for _ in headers) + " |",
    ]
    for row in rows:
        out.append("| " + " | ".join(row) + " |")
    return out


def result_table(rows: list[TestRow], m: int) -> list[str]:
    headers = [
        "Market",
        "N",
        "N",
        "Mean %",
        "Δ mean pp",
        "Up %",
        "Δ up pp",
        "Abs %",
        "Δ abs pp",
        "Range %",
        "p return",
        "p abs",
        "Bonf return",
        "Bonf abs",
    ]
    # The first N header is replaced below with the group label in the caller.
    body: list[list[str]] = []
    for row in rows:
        body.append(
            [
                row.market,
                str(row.number),
                str(row.n),
                fmt(row.mean),
                fmt(row.mean - row.other_mean),
                fmt(row.up_pct, 2),
                fmt(row.up_pct - row.other_up, 2),
                fmt(row.abs_mean),
                fmt(row.abs_mean - row.other_abs),
                fmt(row.range_mean),
                fmt_p(row.p_ret),
                fmt_p(row.p_abs),
                fmt_p(bonferroni(row.p_ret, m)),
                fmt_p(bonferroni(row.p_abs, m)),
            ]
        )
    headers[1] = "Value"
    headers[2] = "N"
    lines = table(headers, body)
    lines.append("")
    lines.append(
        "Δ is the group mean minus the mean of every other session in that market. "
        f"Bonferroni multiplies the raw two-sided p-value by {m} and caps the result at 1."
    )
    return lines


def count_hits(rows: list[TestRow], m: int, alpha: float = 0.05) -> tuple[int, int, int]:
    raw = 0
    adjusted = 0
    tested = 0
    for row in rows:
        for p_value in (row.p_ret, row.p_abs):
            if p_value is None:
                continue
            tested += 1
            if p_value < alpha:
                raw += 1
            if bonferroni(p_value, m) < alpha:
                adjusted += 1
    return tested, raw, adjusted


def hit_lines(rows: list[TestRow], m: int) -> list[str]:
    hits: list[list[str]] = []
    for row in rows:
        for label, p_value, delta in (
            ("return", row.p_ret, row.mean - row.other_mean),
            ("abs move", row.p_abs, row.abs_mean - row.other_abs),
        ):
            if p_value is None or p_value >= 0.05:
                continue
            hits.append(
                [
                    row.market,
                    row.kind,
                    str(row.number),
                    label,
                    fmt(delta),
                    fmt_p(p_value),
                    fmt_p(bonferroni(p_value, m)),
                    str(row.n),
                ]
            )
    if not hits:
        return ["No test in this family has a raw two-sided p-value below 0.05."]
    return table(
        ["Market", "Group", "Value", "Test", "Δ pp", "p", "Bonferroni p", "N"],
        hits,
    )


def crash_study(rows: list[Session]) -> dict[str, Any]:
    ordered = sorted(rows, key=lambda row: (row.ret, row.day.isoformat()))
    worst = ordered[:WORST_N]
    base_a = sum(1 for row in rows if row.day.day in CRASH_DAYS) / len(rows)
    base_b = sum(1 for row in rows if date_sum(row.day) in CRASH_SUMS) / len(rows)
    hits_a = sum(1 for row in worst if row.day.day in CRASH_DAYS)
    hits_b = sum(1 for row in worst if date_sum(row.day) in CRASH_SUMS)
    both = sum(
        1
        for row in worst
        if row.day.day in CRASH_DAYS and date_sum(row.day) in CRASH_SUMS
    )
    return {
        "worst": worst,
        "base_a": base_a,
        "base_b": base_b,
        "hits_a": hits_a,
        "hits_b": hits_b,
        "both": both,
        "n": len(rows),
    }


def binom_row(name: str, hits: int, n: int, base: float) -> list[str]:
    greater = stats.binomtest(hits, n, base, alternative="greater")
    lesser = stats.binomtest(hits, n, base, alternative="less")
    two = stats.binomtest(hits, n, base, alternative="two-sided")
    return [
        name,
        str(hits),
        fmt(n * base, 2),
        fmt(100.0 * base, 2),
        fmt_p(float(greater.pvalue)),
        fmt_p(float(lesser.pvalue)),
        fmt_p(float(two.pvalue)),
        fmt_p(min(1.0, float(two.pvalue) * 4)),
    ]


def find_session(rows: list[Session], day: date) -> Session | None:
    for row in rows:
        if row.day == day:
            return row
    return None


def find_bar(bars: list[dict[str, Any]], day: date) -> dict[str, Any] | None:
    for bar in bars:
        if bar["date"] == day:
            return bar
    return None


def hourly_btc(daily_bar: dict[str, Any] | None = None) -> tuple[list[str], str | None]:
    start = datetime(HOURLY_DAY.year, HOURLY_DAY.month, HOURLY_DAY.day, tzinfo=timezone.utc)
    end = datetime(HOURLY_DAY.year, HOURLY_DAY.month, HOURLY_DAY.day, tzinfo=timezone.utc).timestamp() + 86400
    try:
        payload = fetch_chart(
            "BTC-USD",
            {
                "period1": int(start.timestamp()),
                "period2": int(end),
                "interval": "1h",
            },
        )
    except Exception as exc:  # noqa: BLE001 — report the feed failure, do not invent bars.
        return [], str(exc)
    _, bars = parse_bars(payload)
    bars = [bar for bar in bars if bar["date"] == HOURLY_DAY]
    if not bars:
        return [], "BTC-USD 1h feed returned no bars for 2026-11-08."
    lines: list[str] = []
    high_bar = max(bars, key=lambda bar: bar["high"])
    low_bar = min(bars, key=lambda bar: bar["low"])
    lines.append(
        f"Session high {fmt_px(high_bar['high'])} at {_hour(high_bar)} UTC. "
        f"Session low {fmt_px(low_bar['low'])} at {_hour(low_bar)} UTC. "
        f"First hour open {fmt_px(bars[0]['open'])}. Last hour close {fmt_px(bars[-1]['close'])}."
    )
    lines.append("")
    lines.append(
        "The 75,800 area is the claimed short. Hours whose high-low range covers 75,800, "
        "and the hour that prints the session low, are the tape check. "
        f"Date sum for 8 Nov 2026 is {date_sum(HOURLY_DAY)} (day 8 + month 11 + 2+0+2+6). "
        "Day-of-month 8 is outside the calendar set {7, 11, 22, 28, 29}."
    )
    lines.append("")
    body = []
    for bar in bars:
        flags = []
        if bar["low"] <= 75800 <= bar["high"]:
            flags.append("covers 75800")
        if bar is low_bar:
            flags.append("session low")
        if bar is high_bar:
            flags.append("session high")
        body.append(
            [
                _hour(bar),
                fmt_px(bar["open"]),
                fmt_px(bar["high"]),
                fmt_px(bar["low"]),
                fmt_px(bar["close"]),
                ", ".join(flags) if flags else "",
            ]
        )
    lines.extend(
        table(["Hour UTC", "Open", "High", "Low", "Close", "Note"], body)
    )
    if daily_bar is not None:
        hourly_high = max(bar["high"] for bar in bars)
        hourly_low = min(bar["low"] for bar in bars)
        if abs(daily_bar["high"] - hourly_high) > 0.5 or abs(daily_bar["low"] - hourly_low) > 0.5:
            lines.append("")
            lines.append(
                f"Yahoo's daily high/low is {fmt_px(daily_bar['high'])} / {fmt_px(daily_bar['low'])}. "
                f"The highest and lowest 1-hour prints are {fmt_px(hourly_high)} / {fmt_px(hourly_low)}. "
                "The two Yahoo series do not share one high and one low. Both are reported as returned."
            )
    return lines, None


def _hour(bar: dict[str, Any]) -> str:
    return datetime.fromtimestamp(bar["ts"], timezone.utc).strftime("%H:%M")


def self_check() -> None:
    if date_sum(date(2026, 11, 10)) != 31:
        raise AssertionError("date sum example 10 Nov 2026 failed")
    if date_sum(date(2026, 11, 8)) != 29:
        raise AssertionError("date sum example 8 Nov 2026 failed")
    # Welch sign: a lower group must produce a small 'less' p-value.
    lower = welch([-1.0, -1.2, -0.8, -1.1], [0.2, 0.1, 0.0, 0.3])
    if lower[1] is None or lower[1] > 0.01:
        raise AssertionError(f"Welch less-tail check failed: {lower}")


def feed_checks(symbol_sessions: dict[str, list[Session]]) -> list[str]:
    lines = []
    sp = symbol_sessions.get("^GSPC", [])
    crash = find_session(sp, date(1987, 10, 19))
    if crash is None:
        lines.append("Feed check: 1987-10-19 is missing from the S&P series.")
    else:
        flag = ""
        if not -22.0 <= crash.ret <= -19.0:
            flag = " WARNING: this is outside the -22% to -19% band of the recorded Black Monday move."
        lines.append(
            f"Feed check: S&P 1987-10-19 close-to-close return is {fmt(crash.ret)}% "
            f"(close {fmt_px(crash.close)} from {fmt_px(crash.prev_close)}).{flag}"
        )
    march = find_session(sp, date(2020, 3, 16))
    if march is None:
        lines.append("Feed check: 2020-03-16 is missing from the S&P series.")
    else:
        lines.append(
            f"Feed check: S&P 2020-03-16 close-to-close return is {fmt(march.ret)}%."
        )
    return lines


def build_tests(market: str, symbol: str, rows: list[Session]) -> list[TestRow]:
    out: list[TestRow] = []
    for number in CALENDAR_DAYS:
        mask = [row.day.day == number for row in rows]
        out.append(slice_stats(rows, mask, market, symbol, "A", number))
    for number in SUMS:
        mask = [date_sum(row.day) == number for row in rows]
        out.append(slice_stats(rows, mask, market, symbol, "B", number))
    for number in CONTROL_DAYS:
        mask = [row.day.day == number for row in rows]
        out.append(slice_stats(rows, mask, market, symbol, "control", number))
    return out


def directional_table(rows: list[TestRow], m_dir: int) -> list[str]:
    """Run It Up: 7 and 11 short, 28 long, under both date definitions."""
    wanted = {("A", 7), ("A", 11), ("A", 28), ("B", 7), ("B", 11), ("B", 28)}
    body: list[list[str]] = []
    for row in rows:
        if (row.kind, row.number) not in wanted:
            continue
        bias = "short" if row.number in (7, 11) else "long"
        diff = row.mean - row.other_mean
        agrees = (diff < 0) if bias == "short" else (diff > 0)
        one = row.p_less if bias == "short" else row.p_greater
        body.append(
            [
                row.market,
                "day" if row.kind == "A" else "sum",
                str(row.number),
                bias,
                str(row.n),
                fmt(row.mean),
                fmt(row.other_mean),
                fmt(diff),
                fmt(row.up_pct, 2),
                fmt(row.other_up, 2),
                "yes" if agrees else "no",
                fmt_p(one),
                fmt_p(bonferroni(one, m_dir)),
            ]
        )
    return table(
        [
            "Market",
            "Def",
            "Value",
            "Claim",
            "Days",
            "Mean %",
            "Other %",
            "Δ pp",
            "Up %",
            "Other up %",
            "Sign agrees",
            "One-sided p",
            "Bonf p",
        ],
        body,
    )


def analyze() -> list[str]:
    self_check()
    fetched_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    loaded: list[dict[str, Any]] = []
    failures: list[str] = []
    for spec in INSTRUMENTS:
        try:
            tz_name, bars, note = load_daily(spec["symbol"])
        except Exception as exc:  # noqa: BLE001 — one failed feed must not invent rows.
            failures.append(f"{spec['label']} ({spec['symbol']}): {exc}")
            continue
        positive, dropped = sessions_from_bars(bars, positive_only=True)
        loaded.append(
            {
                **spec,
                "tz": tz_name,
                "bars": bars,
                "note": note,
                "rows": positive,
                "dropped": dropped,
            }
        )

    lines: list[str] = []
    lines.append("# Numerology session study")
    lines.append("")
    lines.append("Research only. This file does not place orders and does not connect to a broker, an exchange, or a wallet.")
    lines.append("")
    lines.append(f"Generated {fetched_at} by `research/numerology-stats.py`.")
    lines.append(
        f"numpy {np.__version__}, scipy {__import__('scipy').__version__}. "
        "Prices are Yahoo Finance v8 chart `quote` closes. The request uses a browser User-Agent."
    )
    lines.append("")
    lines.append("## Method")
    lines.append("")
    lines.append(
        "Each row is one exchange session. The session date is the bar timestamp in the timezone Yahoo reports "
        "(`exchangeTimezoneName`). Bitcoin is UTC. S&P 500, WTI, and gold are America/New_York."
    )
    lines.append("")
    lines.append(
        "The return is the close-to-close percent: `100 * (close - previous close) / previous close`. "
        "The previous close is the prior session Yahoo printed, so a weekend or holiday is the gap between sessions. "
        "An up day has a return above zero. The absolute move is the absolute value of that percent. "
        "The range is `100 * (high - low) / previous close`."
    )
    lines.append("")
    lines.append(
        "Group A is a calendar day of the month equal to N. N = 33 cannot occur, so it is not tested. "
        "Group B is the date sum equal to N: day number + month number + each digit of the year. "
        "The control days are calendar days 5, 13, 19, and 26. "
        "Every test compares the matching sessions with all other sessions of that same market."
    )
    lines.append("")
    lines.append(
        "The p-values are Welch two-sample t-tests (unequal variance) on the returns and, separately, on the absolute returns. "
        "Daily returns and absolute returns are fat-tailed, so the p-value is a large-sample comparison of means, not an exact small-sample probability. "
        "The Run It Up rows also give the one-sided p-value: lower mean for 7 and 11, higher mean for 28."
    )
    lines.append("")
    lines.append(
        "Yahoo `range=max` does not return daily bars (it came back monthly or coarser in a probe). "
        "History is `period1` = Yahoo `firstTradeDate` through the download time, `interval=1d`. "
        "A percent return is stored only when both closes are positive. "
        "WTI settled negative on 2020-04-20, so that session and the next one drop out of the primary sample. "
        "They are listed below, because 2020-04-20 has date sum 28 and 2020-04-21 has date sum 29."
    )
    lines.append("")
    if failures:
        lines.append("## Feed failures")
        lines.append("")
        for failure in failures:
            lines.append(f"- {failure}")
        lines.append("")
        lines.append("No figures are filled in for a market whose feed failed.")
        lines.append("")

    if not loaded:
        lines.append("No market loaded. There are no results.")
        return lines

    all_tests: list[TestRow] = []
    by_symbol_rows: dict[str, list[Session]] = {}
    for item in loaded:
        tests = build_tests(item["short"], item["symbol"], item["rows"])
        item["tests"] = tests
        all_tests.extend(tests)
        by_symbol_rows[item["symbol"]] = item["rows"]

    primary = [row for row in all_tests if row.kind in ("A", "B")]
    controls = [row for row in all_tests if row.kind == "control"]
    primary_tested, primary_raw, primary_bon = count_hits(primary, m=1)
    # Recount with the real family size. m is the number of tests that returned a p-value.
    m_primary = primary_tested
    _, primary_raw, primary_bon = count_hits(primary, m_primary)
    m_control = count_hits(controls, m=1)[0]
    _, control_raw, control_bon = count_hits(controls, m_control)
    directional = [
        row
        for row in primary
        if (row.kind, row.number) in {("A", 7), ("A", 11), ("A", 28), ("B", 7), ("B", 11), ("B", 28)}
    ]
    m_dir = sum(1 for row in directional if (row.p_less if row.number in (7, 11) else row.p_greater) is not None)

    lines.append("## Sample")
    lines.append("")
    sample_body = []
    for item in loaded:
        rows = item["rows"]
        flats = sum(1 for row in rows if row.ret == 0)
        years = (rows[-1].day - rows[0].day).days / 365.25 if rows else 0
        sample_body.append(
            [
                item["short"],
                item["symbol"],
                item["tz"],
                rows[0].day.isoformat() if rows else "n/a",
                rows[-1].day.isoformat() if rows else "n/a",
                f"{years:.1f}",
                str(len(rows)),
                fmt(mean([row.ret for row in rows])),
                fmt(up_pct([row.ret for row in rows]), 2),
                str(flats),
                fmt(mean([row.abs_ret for row in rows])),
                fmt(mean([row.range_pct for row in rows])),
                str(len(item["dropped"])),
            ]
        )
    lines.extend(
        table(
            [
                "Market",
                "Symbol",
                "Timezone",
                "First",
                "Last",
                "Years",
                "Sessions",
                "Mean %",
                "Up %",
                "Flats",
                "Abs %",
                "Range %",
                "Dropped",
            ],
            sample_body,
        )
    )
    lines.append("")
    for item in loaded:
        first_bar = item["bars"][0]["date"].isoformat() if item["bars"] else "n/a"
        last_bar = item["bars"][-1]["date"].isoformat() if item["bars"] else "n/a"
        lines.append(
            f"{item['short']}: {len(item['bars'])} daily bars with OHLC, "
            f"first bar {first_bar}, last bar {last_bar}. Download: {item['note']}."
        )
        download_day = datetime.now(ZoneInfo(item["tz"])).date()
        if item["bars"] and item["bars"][-1]["date"] == download_day:
            lines.append(
                f"{item['short']}: the last bar is {download_day.isoformat()}, "
                f"the download date in {item['tz']}, so that session was still open. "
                "It is day-of-month "
                f"{download_day.day}, date sum {date_sum(download_day)}, "
                "and it stays in the sample because Yahoo had already printed a bar."
            )
    lines.append("")
    lines.extend(feed_checks(by_symbol_rows))
    lines.append("")
    lines.append(
        "S&P history starts in 1927 when Yahoo's first trade date does. "
        "WTI and gold start in 2000, which covers more than 20 years. "
        "Bitcoin starts in September 2014, which is the full Yahoo daily history."
    )
    lines.append("")
    lines.append(
        "WTI and gold are Yahoo continuous front-month futures (`CL=F`, `GC=F`). "
        "A contract roll can change the close without a spot-market move of the same size. "
        "Bitcoin and the S&P 500 do not have that roll."
    )
    lines.append("")

    dropped_notes = []
    for item in loaded:
        for bar in item["dropped"]:
            day = bar["date"]
            prev_close = bar["prev_close"]
            ret_txt = "n/a"
            if prev_close not in (0, None) and math.isfinite(prev_close):
                ret_txt = fmt((bar["close"] - prev_close) / prev_close * 100.0)
            dropped_notes.append(
                [
                    item["short"],
                    day.isoformat(),
                    fmt_px(prev_close) if isinstance(prev_close, float) else "n/a",
                    fmt_px(bar["close"]),
                    ret_txt,
                    str(day.day),
                    str(date_sum(day)),
                    bar["reason"],
                ]
            )
    if dropped_notes:
        lines.append("### Sessions dropped from the percent-return sample")
        lines.append("")
        lines.extend(
            table(
                ["Market", "Date", "Prev close", "Close", "Arithmetic %", "Day", "Sum", "Reason"],
                dropped_notes,
            )
        )
        lines.append("")
        lines.append(
            "The arithmetic percent is shown so those sessions are visible. "
            "It is not used in the primary tests. A percent change through zero is not a usable return: "
            "the 2020-04-21 bounce from a negative close to a positive close prints as a large negative percent."
        )
        lines.append("")

    lines.append("## Multiple testing")
    lines.append("")
    lines.append(
        f"The numerology family is every loaded market, groups A and B, two tests each (return and absolute move). "
        f"{m_primary} tests returned a p-value. "
        f"At a raw 0.05 cutoff, about {0.05 * m_primary:.1f} false positives are expected if every null is true. "
        f"{primary_raw} tests are below 0.05. {primary_bon} stay below 0.05 after Bonferroni (multiply by {m_primary}, cap at 1)."
    )
    lines.append("")
    lines.append(
        f"The control family is separate: calendar days 5, 13, 19, and 26, same two tests. "
        f"{m_control} tests, about {0.05 * m_control:.1f} expected raw hits, {control_raw} observed, "
        f"{control_bon} after a control-only Bonferroni (multiply by {m_control}). "
        "The control hit count is what ordinary calendar noise looks like in this design."
    )
    lines.append("")
    lines.append(
        f"The Run It Up family is smaller and was specified up front: 7 and 11 lower than other days, 28 higher, "
        f"on both the calendar day and the date sum. That is {m_dir} one-sided return tests. "
        "Those one-sided p-values are not part of the two-sided family above."
    )
    lines.append("")
    lines.append("### Numerology tests with raw p below 0.05")
    lines.append("")
    lines.extend(hit_lines(primary, m_primary))
    lines.append("")
    lines.append("### Control tests with raw p below 0.05")
    lines.append("")
    lines.extend(hit_lines(controls, m_control))
    lines.append("")

    lines.append("## Group A — calendar day of the month")
    lines.append("")
    lines.append("33 is not a calendar day, so it has no row.")
    lines.append("")
    lines.extend(result_table([row for row in primary if row.kind == "A"], m_primary))
    lines.append("")
    lines.append("## Group B — date sum")
    lines.append("")
    lines.extend(result_table([row for row in primary if row.kind == "B"], m_primary))
    lines.append("")
    lines.append("## Control days of the month")
    lines.append("")
    lines.append("Same test, days 5, 13, 19, and 26. Bonferroni in this table uses the control family only.")
    lines.append("")
    lines.extend(result_table(controls, m_control))
    lines.append("")

    lines.append("## Run It Up — 7 and 11 short, 28 long")
    lines.append("")
    lines.append(
        "Short means the claim predicts a lower average close-to-close return than other days. "
        "Long means the claim predicts a higher average. "
        "Sign agrees when the sample difference has that sign. "
        "The one-sided p-value matches the claim (less for short, greater for long). "
        f"Bonferroni here multiplies by {m_dir}."
    )
    lines.append("")
    lines.extend(directional_table(primary, m_dir))
    lines.append("")
    agree = 0
    one_hit = 0
    bon_hit = 0
    for row in directional:
        bias = "short" if row.number in (7, 11) else "long"
        diff = row.mean - row.other_mean
        if (diff < 0) if bias == "short" else (diff > 0):
            agree += 1
        one = row.p_less if bias == "short" else row.p_greater
        if one is not None and one < 0.05:
            one_hit += 1
        if one is not None and bonferroni(one, m_dir) < 0.05:
            bon_hit += 1
    lines.append(
        f"{agree} of {len(directional)} claim rows have the predicted sign. "
        f"{one_hit} have a one-sided p-value below 0.05. "
        f"{bon_hit} stay below 0.05 after the directional Bonferroni."
    )
    lines.append("")
    lines.append(
        "A lower up-day rate is a second reading of \"more down.\" The p-value above is on the average return, not on the up-day rate. "
        "A crash on an otherwise ordinary day can pull the average down without changing the up-day rate much. The worst-day section is that crash check."
    )
    lines.append("")

    # WTI sensitivity with the arithmetic percents forced back in.
    wti = next((item for item in loaded if item["symbol"] == "CL=F"), None)
    if wti is not None and wti["dropped"]:
        lines.append("## WTI sensitivity — negative settlement put back in")
        lines.append("")
        forced, _ = sessions_from_bars(wti["bars"], positive_only=False)
        forced_tests = build_tests("WTI", "CL=F", forced)
        focus = [row for row in forced_tests if row.kind == "B" and row.number in (28, 29)]
        primary_focus = [row for row in wti["tests"] if row.kind == "B" and row.number in (28, 29)]
        lines.append(
            "Primary WTI tests use positive closes only. This rerun keeps every finite previous close, including the negative settlement. "
            "It is here because those two sessions land on date sums 28 and 29. The percent through zero is not a meaningful return."
        )
        lines.append("")
        body = []
        for label, subset, sample in (
            ("primary, positive closes", primary_focus, wti["rows"]),
            ("with arithmetic percents through zero", focus, forced),
        ):
            for row in subset:
                body.append(
                    [
                        label,
                        str(row.number),
                        str(row.n),
                        fmt(row.mean),
                        fmt(row.mean - row.other_mean),
                        fmt_p(row.p_ret),
                        fmt(mean([session.ret for session in sample])),
                    ]
                )
        lines.extend(
            table(
                ["Sample", "Sum", "N", "Mean %", "Δ mean pp", "p return", "All-days mean %"],
                body,
            )
        )
        lines.append("")

    lines.append("## Worst 25 daily drops")
    lines.append("")
    lines.append(
        "The 25 most negative close-to-close sessions in the primary sample. "
        "Ties break toward the earlier date. "
        "Group A is day-of-month in {7, 11, 22, 28, 29}. "
        "Group B is date sum in {7, 11, 22, 28, 29, 33}. "
        "The base rate is the share of all primary sessions in that market, not the share of the worst 25. "
        "The binomial model treats each worst day as an independent draw with that probability. "
        "The worst days are a subset of the same sample, and session returns are not independent, so the p-value is a simple enrichment check rather than a structural model. "
        "Four binomial tests are reported (S&P and Bitcoin, sets A and B). The last column multiplies the two-sided p-value by 4."
    )
    lines.append("")
    crash_markets = [item for item in loaded if item["symbol"] in ("^GSPC", "BTC-USD")]
    summary_body = []
    crash_payloads = []
    for item in crash_markets:
        study = crash_study(item["rows"])
        crash_payloads.append((item, study))
        summary_body.append(
            binom_row(
                f"{item['short']} A days",
                study["hits_a"],
                WORST_N,
                study["base_a"],
            )
        )
        summary_body.append(
            binom_row(
                f"{item['short']} B sums",
                study["hits_b"],
                WORST_N,
                study["base_b"],
            )
        )
    lines.extend(
        table(
            [
                "Set",
                "Hits in 25",
                "Expected",
                "Base % of all days",
                "p more",
                "p fewer",
                "p two-sided",
                "Bonf two-sided x4",
            ],
            summary_body,
        )
    )
    lines.append("")
    for item, study in crash_payloads:
        lines.append(
            f"{item['short']}: {study['hits_a']} of the worst 25 fall on calendar set A "
            f"(base rate {fmt(100 * study['base_a'], 2)}% of {study['n']} sessions, expected {fmt(WORST_N * study['base_a'], 2)}). "
            f"{study['hits_b']} fall on date-sum set B "
            f"(base rate {fmt(100 * study['base_b'], 2)}%, expected {fmt(WORST_N * study['base_b'], 2)}). "
            f"The two sets overlap on {study['both']} of those 25 sessions."
        )
        lines.append("")
        body = []
        for rank, row in enumerate(study["worst"], start=1):
            flags = []
            if row.day.day in CRASH_DAYS:
                flags.append("A")
            if date_sum(row.day) in CRASH_SUMS:
                flags.append("B")
            body.append(
                [
                    str(rank),
                    row.day.isoformat(),
                    row.day.strftime("%A"),
                    fmt(row.ret),
                    str(row.day.day),
                    str(date_sum(row.day)),
                    "+".join(flags) if flags else "",
                ]
            )
        lines.append(f"### {item['label']} worst 25")
        lines.append("")
        lines.extend(table(["Rank", "Date", "Weekday", "Return %", "Day", "Sum", "Set"], body))
        lines.append("")

    lines.append("## Bitcoin 1-hour bars, Sunday 8 Nov 2026")
    lines.append("")
    lines.append(
        "UTC session, Yahoo `interval=1h` from 2026-11-08 00:00 UTC to 2026-11-09 00:00 UTC. "
        "The claimed tape is a short near 75,800 that traded down to about 74,000."
    )
    lines.append("")
    btc_loaded = next((item for item in loaded if item["symbol"] == "BTC-USD"), None)
    daily = find_bar(btc_loaded["bars"], HOURLY_DAY) if btc_loaded else None
    hourly_lines, hourly_error = hourly_btc(daily)
    if hourly_error:
        lines.append(f"Feed failed for the hourly chart: {hourly_error}")
        lines.append("")
    else:
        btc = btc_loaded
        daily_ret = find_session(btc["rows"], HOURLY_DAY) if btc is not None else None
        if daily is None:
            lines.append("The daily BTC bar for 2026-11-08 is not in the downloaded daily history.")
        else:
            ret_txt = fmt(daily_ret.ret) if daily_ret is not None else "n/a"
            lines.append(
                f"Daily bar {HOURLY_DAY.isoformat()}: open {fmt_px(daily['open'])}, high {fmt_px(daily['high'])}, "
                f"low {fmt_px(daily['low'])}, close {fmt_px(daily['close'])}. "
                f"Close-to-close return {ret_txt}%."
            )
        lines.append("")
        lines.extend(hourly_lines)
        lines.append("")

    lines.append("## Reading the tests")
    lines.append("")
    lines.append(
        f"Numerology family: {primary_raw} of {m_primary} two-sided tests have p < 0.05, "
        f"against about {0.05 * m_primary:.1f} expected from chance. "
        f"{primary_bon} survive Bonferroni."
    )
    lines.append("")
    lines.append(
        f"Control family: {control_raw} of {m_control} tests have p < 0.05, "
        f"against about {0.05 * m_control:.1f} expected. "
        f"{control_bon} survive the control Bonferroni."
    )
    lines.append("")
    lines.append(
        f"Run It Up sign check: {agree} of {len(directional)} rows point the predicted way. "
        f"{one_hit} one-sided p-values are below 0.05, and {bon_hit} survive the directional Bonferroni."
    )
    lines.append("")
    if primary_bon == 0 and bon_hit == 0:
        lines.append(
            "No pre-specified numerology comparison stays below 0.05 once the number of comparisons is counted. "
            "The raw hits sit near the count this many tests produce by chance, and the control days produce raw hits of the same kind."
        )
    else:
        lines.append(
            "At least one pre-specified comparison stays below 0.05 after its Bonferroni adjustment. "
            "Read that row's Δ in percentage points. A very small daily difference can still clear a p-value bar when the sample is long."
        )
    lines.append("")
    lines.append(
        "These are associations on past Yahoo closes. They are not a forecast, a trading rule, or an execution test."
    )
    lines.append("")
    return lines


def main() -> int:
    lines = analyze()
    text = "\n".join(lines).rstrip() + "\n"
    OUT_PATH.write_text(text, encoding="utf-8")
    print(f"Wrote {OUT_PATH}")
    failed = any(line.startswith("- ") and "feed failed" in line.lower() for line in lines)
    # Non-zero if a market feed failed or the hourly section failed.
    if any("Feed failed" in line or line.startswith("No market loaded") for line in lines):
        return 1
    if failed:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
