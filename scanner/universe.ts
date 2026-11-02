// Strategy watchlist. Sabio cannot trade NAS100, so the index names are US500, US30, and QQQ.

export type MarketKind = "gold" | "index" | "fx" | "oil" | "crypto";

export type Spec = {
  id: string;
  name: string;
  yahoo: string;
  kind: MarketKind;
  /** Round-number spacing in price units. */
  round: number;
  digits: number;
  /** Set for gold: dollars earned by one 10oz unit when price moves $1. */
  dollarsPerPointPer10oz?: number;
  /** FX pip size in price units. USD/JPY is 0.01. */
  pip?: number;
  /** Dollars per pip per standard lot. */
  dollarsPerPipPerLot?: number;
};

export const WATCHLIST: readonly Spec[] = [
  { id: "GOLD", name: "Gold", yahoo: "GC=F", kind: "gold", round: 10, digits: 2, dollarsPerPointPer10oz: 10 },
  { id: "US500", name: "US500", yahoo: "ES=F", kind: "index", round: 25, digits: 2 },
  { id: "US30", name: "US30", yahoo: "YM=F", kind: "index", round: 100, digits: 0 },
  { id: "QQQ", name: "QQQ", yahoo: "QQQ", kind: "index", round: 1, digits: 2 },
  { id: "GBPUSD", name: "GBP/USD", yahoo: "GBPUSD=X", kind: "fx", round: 0.005, digits: 5, pip: 0.0001, dollarsPerPipPerLot: 10 },
  { id: "EURUSD", name: "EUR/USD", yahoo: "EURUSD=X", kind: "fx", round: 0.005, digits: 5, pip: 0.0001, dollarsPerPipPerLot: 10 },
  { id: "USDJPY", name: "USD/JPY", yahoo: "JPY=X", kind: "fx", round: 0.5, digits: 3, pip: 0.01, dollarsPerPipPerLot: 6.33 },
  { id: "OIL", name: "Oil", yahoo: "CL=F", kind: "oil", round: 1, digits: 2 },
  { id: "BTC", name: "Bitcoin", yahoo: "BTC-USD", kind: "crypto", round: 500, digits: 1 },
  { id: "ETH", name: "Ethereum", yahoo: "ETH-USD", kind: "crypto", round: 25, digits: 2 },
  { id: "SOL", name: "Solana", yahoo: "SOL-USD", kind: "crypto", round: 1, digits: 2 },
  { id: "ZEC", name: "Zcash", yahoo: "ZEC-USD", kind: "crypto", round: 5, digits: 2 },
];

export const RISK_DOLLARS = 200;
export const MAX_OPEN_RISK = 600;
export const DAY_LOSS_LIMIT = 400;
export const MAX_DAY_LOSSES = 2;

export function formatPrice(spec: Spec, value: number): string {
  return value.toFixed(spec.digits);
}

/** Position size for a $200 risk. Gold and FX use the desk's contract values. */
export function sizeText(spec: Spec, stopDistance: number): string {
  if (!(stopDistance > 0)) return "n/a";
  if (spec.dollarsPerPointPer10oz) {
    const units = RISK_DOLLARS / (stopDistance * spec.dollarsPerPointPer10oz);
    return `${units.toFixed(2)} x 10oz ($${spec.dollarsPerPointPer10oz} per $1)`;
  }
  if (spec.pip && spec.dollarsPerPipPerLot) {
    const pips = stopDistance / spec.pip;
    const lots = RISK_DOLLARS / (pips * spec.dollarsPerPipPerLot);
    return `${lots.toFixed(2)} lots (${pips.toFixed(1)} pips, $${spec.dollarsPerPipPerLot} a pip)`;
  }
  const units = RISK_DOLLARS / stopDistance;
  return `${units.toFixed(2)} price-units at $1 per unit (200 / stop)`;
}
