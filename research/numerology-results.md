# Numerology session study

Research only. This file does not place orders and does not connect to a broker, an exchange, or a wallet.

Generated 2026-11-14 18:20:28 UTC by `research/numerology-stats.py`.
numpy 2.5.4, scipy 1.18.1. Prices are Yahoo Finance v8 chart `quote` closes. The request uses a browser User-Agent.

## Method

Each row is one exchange session. The session date is the bar timestamp in the timezone Yahoo reports (`exchangeTimezoneName`). Bitcoin is UTC. S&P 500, WTI, and gold are America/New_York.

The return is the close-to-close percent: `100 * (close - previous close) / previous close`. The previous close is the prior session Yahoo printed, so a weekend or holiday is the gap between sessions. An up day has a return above zero. The absolute move is the absolute value of that percent. The range is `100 * (high - low) / previous close`.

Group A is a calendar day of the month equal to N. N = 33 cannot occur, so it is not tested. Group B is the date sum equal to N: day number + month number + each digit of the year. The control days are calendar days 5, 13, 19, and 26. Every test compares the matching sessions with all other sessions of that same market.

The p-values are Welch two-sample t-tests (unequal variance) on the returns and, separately, on the absolute returns. Daily returns and absolute returns are fat-tailed, so the p-value is a large-sample comparison of means, not an exact small-sample probability. The Run It Up rows also give the one-sided p-value: lower mean for 7 and 11, higher mean for 28.

Yahoo `range=max` does not return daily bars (it came back monthly or coarser in a probe). History is `period1` = Yahoo `firstTradeDate` through the download time, `interval=1d`. A percent return is stored only when both closes are positive. WTI settled negative on 2020-04-20, so that session and the next one drop out of the primary sample. They are listed below, because 2020-04-20 has date sum 28 and 2020-04-21 has date sum 29.

## Sample

| Market | Symbol | Timezone | First | Last | Years | Sessions | Mean % | Up % | Flats | Abs % | Range % | Dropped |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BTC | BTC-USD | UTC | 2014-09-18 | 2026-11-14 | 12.2 | 4441 | 0.1718 | 52.26 | 1 | 2.2625 | 4.2370 | 0 |
| WTI | CL=F | America/New_York | 2000-08-24 | 2026-11-13 | 26.2 | 6583 | 0.0592 | 52.07 | 28 | 1.8027 | 3.4148 | 2 |
| Gold | GC=F | America/New_York | 2000-08-31 | 2026-11-13 | 26.2 | 6576 | 0.0468 | 52.51 | 49 | 0.7975 | 1.1208 | 0 |
| S&P | ^GSPC | America/New_York | 1928-01-03 | 2026-11-13 | 98.9 | 24835 | 0.0315 | 52.44 | 313 | 0.7616 | 0.9079 | 0 |

BTC: 4442 daily bars with OHLC, first bar 2014-09-17, last bar 2026-11-14. Download: one request.
BTC: the last bar is 2026-11-14, the download date in UTC, so that session was still open. It is day-of-month 14, date sum 35, and it stays in the sample because Yahoo had already printed a bar.
WTI: 6586 daily bars with OHLC, first bar 2000-08-23, last bar 2026-11-13. Download: one request.
Gold: 6577 daily bars with OHLC, first bar 2000-08-30, last bar 2026-11-13. Download: one request.
S&P: 24836 daily bars with OHLC, first bar 1927-12-30, last bar 2026-11-13. Download: one request.

Feed check: S&P 1987-10-19 close-to-close return is -20.4669% (close 224.84 from 282.70).
Feed check: S&P 2020-03-16 close-to-close return is -11.9841%.

S&P history starts in 1927 when Yahoo's first trade date does. WTI and gold start in 2000, which covers more than 20 years. Bitcoin starts in September 2014, which is the full Yahoo daily history.

WTI and gold are Yahoo continuous front-month futures (`CL=F`, `GC=F`). A contract roll can change the close without a spot-market move of the same size. Bitcoin and the S&P 500 do not have that roll.

### Sessions dropped from the percent-return sample

| Market | Date | Prev close | Close | Arithmetic % | Day | Sum | Reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| WTI | 2020-04-20 | 18.27 | -37.63 | -305.9661 | 20 | 28 | non-positive price |
| WTI | 2020-04-21 | -37.63 | 10.01 | -126.6011 | 21 | 29 | non-positive price |

The arithmetic percent is shown so those sessions are visible. It is not used in the primary tests. A percent change through zero is not a usable return: the 2020-04-21 bounce from a negative close to a positive close prints as a large negative percent.

## Multiple testing

The numerology family is every loaded market, groups A and B, two tests each (return and absolute move). 88 tests returned a p-value. At a raw 0.05 cutoff, about 4.4 false positives are expected if every null is true. 6 tests are below 0.05. 0 stay below 0.05 after Bonferroni (multiply by 88, cap at 1).

The control family is separate: calendar days 5, 13, 19, and 26, same two tests. 32 tests, about 1.6 expected raw hits, 2 observed, 0 after a control-only Bonferroni (multiply by 32). The control hit count is what ordinary calendar noise looks like in this design.

The Run It Up family is smaller and was specified up front: 7 and 11 lower than other days, 28 higher, on both the calendar day and the date sum. That is 24 one-sided return tests. Those one-sided p-values are not part of the two-sided family above.

### Numerology tests with raw p below 0.05

| Market | Group | Value | Test | Δ pp | p | Bonferroni p | N |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BTC | A | 29 | abs move | -0.4549 | 0.0080 | 0.7017 | 137 |
| BTC | B | 11 | return | 1.4041 | 0.0117 | 1.0000 | 24 |
| WTI | A | 29 | return | 0.4341 | 0.0285 | 1.0000 | 203 |
| WTI | B | 7 | return | 2.1988 | 0.0444 | 1.0000 | 9 |
| Gold | B | 29 | abs move | -0.1038 | 0.0364 | 1.0000 | 214 |
| S&P | A | 7 | return | -0.0975 | 0.0138 | 1.0000 | 818 |

### Control tests with raw p below 0.05

| Market | Group | Value | Test | Δ pp | p | Bonferroni p | N |
| --- | --- | --- | --- | --- | --- | --- | --- |
| WTI | control | 13 | abs move | -0.2162 | 0.0373 | 1.0000 | 225 |
| S&P | control | 19 | return | -0.1193 | 0.0116 | 0.3706 | 825 |

## Group A — calendar day of the month

33 is not a calendar day, so it has no row.

| Market | Value | N | Mean % | Δ mean pp | Up % | Δ up pp | Abs % | Δ abs pp | Range % | p return | p abs | Bonf return | Bonf abs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BTC | 7 | 146 | 0.1751 | 0.0034 | 54.79 | 2.62 | 2.1901 | -0.0748 | 4.1088 | 0.9907 | 0.7380 | 1.0000 | 1.0000 |
| BTC | 11 | 146 | 0.0548 | -0.1210 | 54.79 | 2.62 | 2.4282 | 0.1714 | 4.3072 | 0.6924 | 0.4504 | 1.0000 | 1.0000 |
| BTC | 22 | 146 | -0.1924 | -0.3766 | 47.95 | -4.46 | 2.2331 | -0.0304 | 4.3637 | 0.1602 | 0.8727 | 1.0000 | 1.0000 |
| BTC | 28 | 146 | 0.4856 | 0.3244 | 53.42 | 1.20 | 2.1311 | -0.1359 | 3.9771 | 0.2568 | 0.5458 | 1.0000 | 1.0000 |
| BTC | 29 | 137 | 0.1849 | 0.0136 | 48.18 | -4.22 | 1.8216 | -0.4549 | 3.8173 | 0.9536 | 0.0080 | 1.0000 | 0.7017 |
| WTI | 7 | 219 | -0.2243 | -0.2932 | 44.75 | -7.58 | 1.6534 | -0.1545 | 3.4515 | 0.0577 | 0.1390 | 1.0000 | 1.0000 |
| WTI | 11 | 222 | 0.0887 | 0.0305 | 56.31 | 4.38 | 1.7171 | -0.0885 | 3.3075 | 0.8474 | 0.4058 | 1.0000 | 1.0000 |
| WTI | 22 | 219 | 0.4051 | 0.3578 | 54.34 | 2.34 | 1.9536 | 0.1561 | 3.5459 | 0.1581 | 0.4702 | 1.0000 | 1.0000 |
| WTI | 28 | 216 | -0.1241 | -0.1895 | 51.85 | -0.23 | 1.6431 | -0.1650 | 3.2686 | 0.2209 | 0.1145 | 1.0000 | 1.0000 |
| WTI | 29 | 203 | 0.4799 | 0.4341 | 57.14 | 5.23 | 1.8500 | 0.0489 | 3.4592 | 0.0285 | 0.7447 | 1.0000 | 1.0000 |
| Gold | 7 | 219 | -0.0379 | -0.0875 | 47.03 | -5.67 | 0.7209 | -0.0792 | 1.1545 | 0.2084 | 0.1030 | 1.0000 | 1.0000 |
| Gold | 11 | 222 | 0.1162 | 0.0719 | 54.50 | 2.07 | 0.7626 | -0.0361 | 1.1296 | 0.3355 | 0.5022 | 1.0000 | 1.0000 |
| Gold | 22 | 219 | 0.0602 | 0.0140 | 51.14 | -1.41 | 0.7043 | -0.0964 | 0.8973 | 0.8431 | 0.0597 | 1.0000 | 1.0000 |
| Gold | 28 | 214 | -0.0053 | -0.0538 | 49.53 | -3.08 | 0.7869 | -0.0110 | 1.0573 | 0.4753 | 0.8319 | 1.0000 | 1.0000 |
| Gold | 29 | 200 | 0.0421 | -0.0048 | 54.50 | 2.05 | 0.7372 | -0.0622 | 1.1251 | 0.9486 | 0.2345 | 1.0000 | 1.0000 |
| S&P | 7 | 818 | -0.0628 | -0.0975 | 47.80 | -4.80 | 0.7250 | -0.0378 | 0.8977 | 0.0138 | 0.2075 | 1.0000 | 1.0000 |
| S&P | 11 | 827 | 0.0372 | 0.0059 | 53.33 | 0.92 | 0.7592 | -0.0024 | 0.9164 | 0.8864 | 0.9386 | 1.0000 | 1.0000 |
| S&P | 22 | 802 | -0.0357 | -0.0695 | 49.25 | -3.29 | 0.7351 | -0.0274 | 0.9036 | 0.0833 | 0.3638 | 1.0000 | 1.0000 |
| S&P | 28 | 819 | 0.0382 | 0.0069 | 54.33 | 1.96 | 0.7462 | -0.0159 | 0.8858 | 0.8710 | 0.6343 | 1.0000 | 1.0000 |
| S&P | 29 | 775 | 0.0632 | 0.0327 | 51.74 | -0.72 | 0.7571 | -0.0046 | 0.8968 | 0.4493 | 0.8890 | 1.0000 | 1.0000 |

Δ is the group mean minus the mean of every other session in that market. Bonferroni multiplies the raw two-sided p-value by 88 and caps the result at 1.

## Group B — date sum

| Market | Value | N | Mean % | Δ mean pp | Up % | Δ up pp | Abs % | Δ abs pp | Range % | p return | p abs | Bonf return | Bonf abs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BTC | 7 | 3 | -0.4150 | -0.5872 | 66.67 | 14.41 | 1.5730 | -0.6899 | 2.6474 | 0.6971 | 0.4518 | 1.0000 | 1.0000 |
| BTC | 11 | 24 | 1.5684 | 1.4041 | 70.83 | 18.67 | 2.0687 | -0.1948 | 4.2821 | 0.0117 | 0.6534 | 1.0000 | 1.0000 |
| BTC | 22 | 140 | 0.4149 | 0.2510 | 57.14 | 5.04 | 2.3672 | 0.1081 | 4.3223 | 0.4243 | 0.6539 | 1.0000 | 1.0000 |
| BTC | 28 | 146 | 0.1759 | 0.0043 | 52.74 | 0.49 | 2.3155 | 0.0548 | 4.3210 | 0.9896 | 0.8354 | 1.0000 | 1.0000 |
| BTC | 29 | 146 | -0.1523 | -0.3351 | 56.16 | 4.03 | 2.1940 | -0.0708 | 4.3728 | 0.2720 | 0.7695 | 1.0000 | 1.0000 |
| BTC | 33 | 146 | -0.0983 | -0.2793 | 52.74 | 0.49 | 2.3897 | 0.1316 | 4.4370 | 0.3503 | 0.5506 | 1.0000 | 1.0000 |
| WTI | 7 | 9 | 2.2550 | 2.1988 | 77.78 | 25.74 | 2.8651 | 1.0639 | 4.0885 | 0.0444 | 0.1560 | 1.0000 | 1.0000 |
| WTI | 11 | 52 | 0.1644 | 0.1060 | 44.23 | -7.91 | 1.9477 | 0.1461 | 3.6954 | 0.7868 | 0.6026 | 1.0000 | 1.0000 |
| WTI | 22 | 209 | 0.1126 | 0.0551 | 53.59 | 1.56 | 1.8287 | 0.0269 | 3.6233 | 0.7647 | 0.8383 | 1.0000 | 1.0000 |
| WTI | 28 | 218 | -0.0083 | -0.0698 | 50.92 | -1.20 | 1.7537 | -0.0507 | 3.2634 | 0.6668 | 0.6372 | 1.0000 | 1.0000 |
| WTI | 29 | 213 | 0.0406 | -0.0192 | 53.52 | 1.50 | 1.6301 | -0.1783 | 3.1888 | 0.9029 | 0.1003 | 1.0000 | 1.0000 |
| WTI | 33 | 225 | 0.0698 | 0.0109 | 45.33 | -6.98 | 1.8386 | 0.0372 | 3.3704 | 0.9498 | 0.7578 | 1.0000 | 1.0000 |
| Gold | 7 | 9 | 0.2322 | 0.1857 | 55.56 | 3.05 | 0.5244 | -0.2735 | 0.7706 | 0.4425 | 0.1225 | 1.0000 | 1.0000 |
| Gold | 11 | 52 | -0.0624 | -0.1100 | 53.85 | 1.35 | 0.7516 | -0.0462 | 1.1755 | 0.4585 | 0.6553 | 1.0000 | 1.0000 |
| Gold | 22 | 209 | 0.0944 | 0.0492 | 53.11 | 0.62 | 0.8444 | 0.0484 | 1.1546 | 0.5564 | 0.4139 | 1.0000 | 1.0000 |
| Gold | 28 | 219 | 0.0435 | -0.0034 | 53.88 | 1.42 | 0.8019 | 0.0046 | 1.0023 | 0.9653 | 0.9347 | 1.0000 | 1.0000 |
| Gold | 29 | 214 | 0.1099 | 0.0653 | 56.07 | 3.69 | 0.6971 | -0.1038 | 0.9720 | 0.3447 | 0.0364 | 1.0000 | 1.0000 |
| Gold | 33 | 225 | -0.0223 | -0.0715 | 44.44 | -8.35 | 0.7837 | -0.0143 | 1.1026 | 0.3655 | 0.8065 | 1.0000 | 1.0000 |
| S&P | 7 | 12 | 0.4608 | 0.4295 | 75.00 | 22.57 | 1.5091 | 0.7479 | 2.0289 | 0.4940 | 0.1064 | 1.0000 | 1.0000 |
| S&P | 11 | 57 | 0.1333 | 0.1020 | 47.37 | -5.08 | 0.8459 | 0.0845 | 1.3856 | 0.5140 | 0.4371 | 1.0000 | 1.0000 |
| S&P | 22 | 295 | 0.1244 | 0.0940 | 61.02 | 8.68 | 0.8756 | 0.1154 | 1.0354 | 0.2561 | 0.0773 | 1.0000 | 1.0000 |
| S&P | 28 | 544 | 0.0916 | 0.0614 | 55.15 | 2.77 | 0.7674 | 0.0060 | 0.8497 | 0.2237 | 0.8757 | 1.0000 | 1.0000 |
| S&P | 29 | 588 | -0.0075 | -0.0400 | 53.23 | 0.81 | 0.7821 | 0.0210 | 0.8408 | 0.4340 | 0.5938 | 1.0000 | 1.0000 |
| S&P | 33 | 737 | 0.0885 | 0.0587 | 51.42 | -1.04 | 0.7730 | 0.0117 | 0.9182 | 0.2074 | 0.7489 | 1.0000 | 1.0000 |

Δ is the group mean minus the mean of every other session in that market. Bonferroni multiplies the raw two-sided p-value by 88 and caps the result at 1.

## Control days of the month

Same test, days 5, 13, 19, and 26. Bonferroni in this table uses the control family only.

| Market | Value | N | Mean % | Δ mean pp | Up % | Δ up pp | Abs % | Δ abs pp | Range % | p return | p abs | Bonf return | Bonf abs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BTC | 5 | 146 | 0.0884 | -0.0862 | 54.79 | 2.62 | 2.4375 | 0.1809 | 4.5892 | 0.7883 | 0.4635 | 1.0000 | 1.0000 |
| BTC | 13 | 146 | 0.3613 | 0.1960 | 52.05 | -0.22 | 2.5723 | 0.3204 | 4.8042 | 0.5533 | 0.2032 | 1.0000 | 1.0000 |
| BTC | 19 | 146 | 0.4156 | 0.2521 | 56.16 | 4.03 | 2.2786 | 0.0166 | 4.1225 | 0.4152 | 0.9457 | 1.0000 | 1.0000 |
| BTC | 26 | 146 | 0.4034 | 0.2394 | 55.48 | 3.33 | 2.3007 | 0.0395 | 4.5294 | 0.4036 | 0.8527 | 1.0000 | 1.0000 |
| WTI | 5 | 217 | 0.1658 | 0.1102 | 53.00 | 0.95 | 1.8307 | 0.0290 | 3.3873 | 0.5612 | 0.8379 | 1.0000 | 1.0000 |
| WTI | 13 | 225 | 0.2771 | 0.2256 | 53.33 | 1.30 | 1.5938 | -0.2162 | 3.2186 | 0.1311 | 0.0373 | 1.0000 | 1.0000 |
| WTI | 19 | 212 | 0.1137 | 0.0563 | 50.94 | -1.17 | 1.8209 | 0.0188 | 3.4676 | 0.7814 | 0.9054 | 1.0000 | 1.0000 |
| WTI | 26 | 212 | 0.3196 | 0.2690 | 55.66 | 3.71 | 1.6527 | -0.1550 | 3.2052 | 0.1074 | 0.2029 | 1.0000 | 1.0000 |
| Gold | 5 | 217 | 0.0557 | 0.0092 | 52.07 | -0.45 | 0.8361 | 0.0400 | 1.2955 | 0.9064 | 0.4521 | 1.0000 | 1.0000 |
| Gold | 13 | 225 | -0.0240 | -0.0733 | 51.56 | -0.99 | 0.7982 | 0.0008 | 1.1149 | 0.3520 | 0.9889 | 1.0000 | 1.0000 |
| Gold | 19 | 212 | 0.0865 | 0.0410 | 55.19 | 2.77 | 0.8791 | 0.0844 | 0.9809 | 0.6664 | 0.2480 | 1.0000 | 1.0000 |
| Gold | 26 | 212 | 0.0619 | 0.0156 | 53.77 | 1.31 | 0.7134 | -0.0869 | 0.8691 | 0.8214 | 0.0704 | 1.0000 | 1.0000 |
| S&P | 5 | 810 | 0.0770 | 0.0471 | 53.95 | 1.56 | 0.8059 | 0.0458 | 0.9374 | 0.2932 | 0.1830 | 1.0000 | 1.0000 |
| S&P | 13 | 837 | -0.0050 | -0.0377 | 52.09 | -0.36 | 0.7347 | -0.0279 | 0.9099 | 0.3749 | 0.4086 | 1.0000 | 1.0000 |
| S&P | 19 | 825 | -0.0838 | -0.1193 | 46.67 | -5.97 | 0.7485 | -0.0135 | 0.9079 | 0.0116 | 0.7297 | 0.3706 | 1.0000 |
| S&P | 26 | 807 | 0.0011 | -0.0315 | 52.66 | 0.23 | 0.7493 | -0.0127 | 0.8659 | 0.4466 | 0.6858 | 1.0000 | 1.0000 |

Δ is the group mean minus the mean of every other session in that market. Bonferroni multiplies the raw two-sided p-value by 32 and caps the result at 1.

## Run It Up — 7 and 11 short, 28 long

Short means the claim predicts a lower average close-to-close return than other days. Long means the claim predicts a higher average. Sign agrees when the sample difference has that sign. The one-sided p-value matches the claim (less for short, greater for long). Bonferroni here multiplies by 24.

| Market | Def | Value | Claim | Days | Mean % | Other % | Δ pp | Up % | Other up % | Sign agrees | One-sided p | Bonf p |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BTC | day | 7 | short | 146 | 0.1751 | 0.1717 | 0.0034 | 54.79 | 52.18 | no | 0.5046 | 1.0000 |
| BTC | day | 11 | short | 146 | 0.0548 | 0.1758 | -0.1210 | 54.79 | 52.18 | yes | 0.3462 | 1.0000 |
| BTC | day | 28 | long | 146 | 0.4856 | 0.1611 | 0.3244 | 53.42 | 52.22 | yes | 0.1284 | 1.0000 |
| BTC | sum | 7 | short | 3 | -0.4150 | 0.1722 | -0.5872 | 66.67 | 52.25 | yes | 0.3485 | 1.0000 |
| BTC | sum | 11 | short | 24 | 1.5684 | 0.1642 | 1.4041 | 70.83 | 52.16 | no | 0.9942 | 1.0000 |
| BTC | sum | 28 | long | 146 | 0.1759 | 0.1717 | 0.0043 | 52.74 | 52.25 | yes | 0.4948 | 1.0000 |
| WTI | day | 7 | short | 219 | -0.2243 | 0.0690 | -0.2932 | 44.75 | 52.33 | yes | 0.0289 | 0.6930 |
| WTI | day | 11 | short | 222 | 0.0887 | 0.0582 | 0.0305 | 56.31 | 51.93 | no | 0.5763 | 1.0000 |
| WTI | day | 28 | long | 216 | -0.1241 | 0.0654 | -0.1895 | 51.85 | 52.08 | no | 0.8896 | 1.0000 |
| WTI | sum | 7 | short | 9 | 2.2550 | 0.0562 | 2.1988 | 77.78 | 52.04 | no | 0.9778 | 1.0000 |
| WTI | sum | 11 | short | 52 | 0.1644 | 0.0584 | 0.1060 | 44.23 | 52.14 | no | 0.6066 | 1.0000 |
| WTI | sum | 28 | long | 218 | -0.0083 | 0.0615 | -0.0698 | 50.92 | 52.11 | no | 0.6666 | 1.0000 |
| Gold | day | 7 | short | 219 | -0.0379 | 0.0497 | -0.0875 | 47.03 | 52.70 | yes | 0.1042 | 1.0000 |
| Gold | day | 11 | short | 222 | 0.1162 | 0.0443 | 0.0719 | 54.50 | 52.44 | no | 0.8322 | 1.0000 |
| Gold | day | 28 | long | 214 | -0.0053 | 0.0485 | -0.0538 | 49.53 | 52.61 | no | 0.7623 | 1.0000 |
| Gold | sum | 7 | short | 9 | 0.2322 | 0.0465 | 0.1857 | 55.56 | 52.50 | no | 0.7788 | 1.0000 |
| Gold | sum | 11 | short | 52 | -0.0624 | 0.0476 | -0.1100 | 53.85 | 52.50 | yes | 0.2292 | 1.0000 |
| Gold | sum | 28 | long | 219 | 0.0435 | 0.0469 | -0.0034 | 53.88 | 52.46 | no | 0.5173 | 1.0000 |
| S&P | day | 7 | short | 818 | -0.0628 | 0.0347 | -0.0975 | 47.80 | 52.60 | yes | 0.0069 | 0.1650 |
| S&P | day | 11 | short | 827 | 0.0372 | 0.0313 | 0.0059 | 53.33 | 52.41 | no | 0.5568 | 1.0000 |
| S&P | day | 28 | long | 819 | 0.0382 | 0.0313 | 0.0069 | 54.33 | 52.37 | yes | 0.4355 | 1.0000 |
| S&P | sum | 7 | short | 12 | 0.4608 | 0.0313 | 0.4295 | 75.00 | 52.43 | no | 0.7530 | 1.0000 |
| S&P | sum | 11 | short | 57 | 0.1333 | 0.0313 | 0.1020 | 47.37 | 52.45 | no | 0.7430 | 1.0000 |
| S&P | sum | 28 | long | 544 | 0.0916 | 0.0302 | 0.0614 | 55.15 | 52.38 | yes | 0.1118 | 1.0000 |

10 of 24 claim rows have the predicted sign. 2 have a one-sided p-value below 0.05. 0 stay below 0.05 after the directional Bonferroni.

A lower up-day rate is a second reading of "more down." The p-value above is on the average return, not on the up-day rate. A crash on an otherwise ordinary day can pull the average down without changing the up-day rate much. The worst-day section is that crash check.

## WTI sensitivity — negative settlement put back in

Primary WTI tests use positive closes only. This rerun keeps every finite previous close, including the negative settlement. It is here because those two sessions land on date sums 28 and 29. The percent through zero is not a meaningful return.

| Sample | Sum | N | Mean % | Δ mean pp | p return | All-days mean % |
| --- | --- | --- | --- | --- | --- | --- |
| primary, positive closes | 28 | 218 | -0.0083 | -0.0698 | 0.6668 | 0.0592 |
| primary, positive closes | 29 | 213 | 0.0406 | -0.0192 | 0.9029 | 0.0592 |
| with arithmetic percents through zero | 28 | 219 | -1.4053 | -1.4470 | 0.3047 | -0.0065 |
| with arithmetic percents through zero | 29 | 214 | -0.5512 | -0.5630 | 0.3602 | -0.0065 |

## Worst 25 daily drops

The 25 most negative close-to-close sessions in the primary sample. Ties break toward the earlier date. Group A is day-of-month in {7, 11, 22, 28, 29}. Group B is date sum in {7, 11, 22, 28, 29, 33}. The base rate is the share of all primary sessions in that market, not the share of the worst 25. The binomial model treats each worst day as an independent draw with that probability. The worst days are a subset of the same sample, and session returns are not independent, so the p-value is a simple enrichment check rather than a structural model. Four binomial tests are reported (S&P and Bitcoin, sets A and B). The last column multiplies the two-sided p-value by 4.

| Set | Hits in 25 | Expected | Base % of all days | p more | p fewer | p two-sided | Bonf two-sided x4 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BTC A days | 2 | 4.06 | 16.24 | 0.9303 | 0.2041 | 0.4140 | 1.0000 |
| BTC B sums | 7 | 3.41 | 13.62 | 0.0448 | 0.9852 | 0.0705 | 0.2820 |
| S&P A days | 4 | 4.07 | 16.27 | 0.5980 | 0.6149 | 1.0000 | 1.0000 |
| S&P B sums | 2 | 2.25 | 8.99 | 0.6709 | 0.6069 | 1.0000 | 1.0000 |

BTC: 2 of the worst 25 fall on calendar set A (base rate 16.24% of 4441 sessions, expected 4.06). 7 fall on date-sum set B (base rate 13.62%, expected 3.41). The two sets overlap on 1 of those 25 sessions.

### Bitcoin worst 25

| Rank | Date | Weekday | Return % | Day | Sum | Set |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 2020-03-12 | Thursday | -37.1695 | 12 | 19 |  |
| 2 | 2015-01-14 | Wednesday | -21.1449 | 14 | 23 |  |
| 3 | 2017-09-14 | Thursday | -18.7411 | 14 | 33 | B |
| 4 | 2015-08-18 | Tuesday | -18.1788 | 18 | 34 |  |
| 5 | 2018-01-16 | Tuesday | -16.8548 | 16 | 28 | B |
| 6 | 2022-06-13 | Monday | -15.9747 | 13 | 25 |  |
| 7 | 2018-02-05 | Monday | -15.9688 | 5 | 18 |  |
| 8 | 2015-01-13 | Tuesday | -15.6593 | 13 | 22 | B |
| 9 | 2016-01-15 | Friday | -15.3321 | 15 | 25 |  |
| 10 | 2022-11-09 | Wednesday | -14.3490 | 9 | 26 |  |
| 11 | 2017-01-11 | Wednesday | -14.3136 | 11 | 22 | A+B |
| 12 | 2026-02-05 | Thursday | -14.1299 | 5 | 17 |  |
| 13 | 2019-06-27 | Thursday | -14.0857 | 27 | 45 |  |
| 14 | 2021-05-19 | Wednesday | -13.7661 | 19 | 29 | B |
| 15 | 2018-11-19 | Monday | -13.3732 | 19 | 41 |  |
| 16 | 2021-05-12 | Wednesday | -13.3217 | 12 | 22 | B |
| 17 | 2021-01-21 | Thursday | -13.2837 | 21 | 27 |  |
| 18 | 2019-07-16 | Tuesday | -13.0100 | 16 | 35 |  |
| 19 | 2017-12-22 | Friday | -12.4730 | 22 | 44 | A |
| 20 | 2017-01-05 | Thursday | -12.2410 | 5 | 16 |  |
| 21 | 2017-12-30 | Saturday | -11.6265 | 30 | 52 |  |
| 22 | 2017-03-18 | Saturday | -11.4896 | 18 | 31 |  |
| 23 | 2015-11-10 | Tuesday | -11.4233 | 10 | 29 | B |
| 24 | 2019-09-24 | Tuesday | -11.3960 | 24 | 45 |  |
| 25 | 2021-06-21 | Monday | -11.2655 | 21 | 32 |  |

S&P: 4 of the worst 25 fall on calendar set A (base rate 16.27% of 24835 sessions, expected 4.07). 2 fall on date-sum set B (base rate 8.99%, expected 2.25). The two sets overlap on 0 of those 25 sessions.

### S&P 500 worst 25

| Rank | Date | Weekday | Return % | Day | Sum | Set |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1987-10-19 | Monday | -20.4669 | 19 | 54 |  |
| 2 | 1929-10-28 | Monday | -12.9403 | 28 | 59 | A |
| 3 | 2020-03-16 | Monday | -11.9841 | 16 | 23 |  |
| 4 | 1929-10-29 | Tuesday | -10.1583 | 29 | 60 | A |
| 5 | 1935-04-16 | Tuesday | -9.9671 | 16 | 38 |  |
| 6 | 1929-11-06 | Wednesday | -9.9213 | 6 | 38 |  |
| 7 | 1946-09-03 | Tuesday | -9.9099 | 3 | 32 |  |
| 8 | 2020-03-12 | Thursday | -9.5113 | 12 | 19 |  |
| 9 | 1937-10-18 | Monday | -9.1216 | 18 | 48 |  |
| 10 | 1931-10-05 | Monday | -9.0722 | 5 | 29 | B |
| 11 | 2008-10-15 | Wednesday | -9.0350 | 15 | 35 |  |
| 12 | 2008-12-01 | Monday | -8.9295 | 1 | 23 |  |
| 13 | 1933-07-20 | Thursday | -8.8793 | 20 | 43 |  |
| 14 | 2008-09-29 | Monday | -8.8068 | 29 | 48 | A |
| 15 | 1933-07-21 | Friday | -8.7039 | 21 | 44 |  |
| 16 | 1932-10-10 | Monday | -8.5470 | 10 | 35 |  |
| 17 | 1987-10-26 | Monday | -8.2789 | 26 | 61 |  |
| 18 | 1932-10-05 | Wednesday | -8.1988 | 5 | 30 |  |
| 19 | 1932-08-12 | Friday | -8.0158 | 12 | 35 |  |
| 20 | 1935-08-16 | Friday | -7.9723 | 16 | 42 |  |
| 21 | 1934-07-26 | Thursday | -7.8280 | 26 | 50 |  |
| 22 | 1938-10-11 | Tuesday | -7.6923 | 11 | 42 | A |
| 23 | 1930-06-16 | Monday | -7.6370 | 16 | 35 |  |
| 24 | 2008-10-09 | Thursday | -7.6167 | 9 | 29 | B |
| 25 | 2020-03-09 | Monday | -7.5970 | 9 | 16 |  |

## Bitcoin 1-hour bars, Sunday 8 Nov 2026

UTC session, Yahoo `interval=1h` from 2026-11-08 00:00 UTC to 2026-11-09 00:00 UTC. The claimed tape is a short near 75,800 that traded down to about 74,000.

Daily bar 2026-11-08: open 75,747.58, high 76,096.69, low 73,691.77, close 74,584.65. Close-to-close return -1.5353%.

Session high 76,094.95 at 13:00 UTC. Session low 73,590.93 at 21:00 UTC. First hour open 75,742.79. Last hour close 74,724.93.

The 75,800 area is the claimed short. Hours whose high-low range covers 75,800, and the hour that prints the session low, are the tape check. Date sum for 8 Nov 2026 is 29 (day 8 + month 11 + 2+0+2+6). Day-of-month 8 is outside the calendar set {7, 11, 22, 28, 29}.

| Hour UTC | Open | High | Low | Close | Note |
| --- | --- | --- | --- | --- | --- |
| 00:00 | 75,742.79 | 75,746.09 | 75,608.82 | 75,697.94 |  |
| 01:00 | 75,696.42 | 75,720.81 | 75,636.00 | 75,636.02 |  |
| 02:00 | 75,633.15 | 75,685.55 | 75,545.34 | 75,683.49 |  |
| 03:00 | 75,690.89 | 75,817.51 | 75,690.89 | 75,806.29 | covers 75800 |
| 04:00 | 75,809.06 | 75,868.26 | 75,724.99 | 75,753.65 | covers 75800 |
| 05:00 | 75,766.43 | 75,792.80 | 75,690.13 | 75,714.49 |  |
| 06:00 | 75,720.18 | 75,749.68 | 75,660.19 | 75,722.58 |  |
| 07:00 | 75,722.57 | 75,880.24 | 75,722.57 | 75,855.95 | covers 75800 |
| 08:00 | 75,855.97 | 75,855.97 | 75,760.00 | 75,818.73 | covers 75800 |
| 09:00 | 75,818.72 | 75,857.82 | 75,759.63 | 75,818.68 | covers 75800 |
| 10:00 | 75,818.68 | 75,825.84 | 75,694.12 | 75,787.12 | covers 75800 |
| 11:00 | 75,786.43 | 75,917.96 | 75,786.43 | 75,872.42 | covers 75800 |
| 12:00 | 75,878.08 | 75,889.51 | 75,819.82 | 75,868.32 |  |
| 13:00 | 75,876.26 | 76,094.95 | 75,783.31 | 75,823.64 | covers 75800, session high |
| 14:00 | 75,821.83 | 75,953.15 | 75,780.70 | 75,936.10 | covers 75800 |
| 15:00 | 75,941.96 | 75,996.29 | 75,891.51 | 75,965.83 |  |
| 16:00 | 75,969.66 | 75,997.99 | 75,629.10 | 75,678.80 | covers 75800 |
| 17:00 | 75,673.27 | 75,757.90 | 75,561.86 | 75,653.87 |  |
| 18:00 | 75,653.87 | 75,871.15 | 75,631.66 | 75,845.03 | covers 75800 |
| 19:00 | 75,845.03 | 75,847.63 | 75,731.72 | 75,834.29 | covers 75800 |
| 20:00 | 75,834.30 | 75,848.52 | 75,642.07 | 75,643.58 | covers 75800 |
| 21:00 | 75,671.57 | 75,690.69 | 73,590.93 | 74,014.92 | session low |
| 22:00 | 74,027.70 | 74,653.55 | 73,949.36 | 74,380.75 |  |
| 23:00 | 74,366.66 | 75,594.62 | 74,366.66 | 74,724.93 |  |

Yahoo's daily high/low is 76,096.69 / 73,691.77. The highest and lowest 1-hour prints are 76,094.95 / 73,590.93. The two Yahoo series do not share one high and one low. Both are reported as returned.

## Reading the tests

Numerology family: 6 of 88 two-sided tests have p < 0.05, against about 4.4 expected from chance. 0 survive Bonferroni.

Control family: 2 of 32 tests have p < 0.05, against about 1.6 expected. 0 survive the control Bonferroni.

Run It Up sign check: 10 of 24 rows point the predicted way. 2 one-sided p-values are below 0.05, and 0 survive the directional Bonferroni.

No pre-specified numerology comparison stays below 0.05 once the number of comparisons is counted. The raw hits sit near the count this many tests produce by chance, and the control days produce raw hits of the same kind.

These are associations on past Yahoo closes. They are not a forecast, a trading rule, or an execution test.
