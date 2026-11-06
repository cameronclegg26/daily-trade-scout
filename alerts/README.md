# Alerts

`npm run scan` appends A and A+ lines to `alerts/YYYY-MM-DD.md`. The date is Europe/London. Those dated files are local and are not committed.

Each file starts with a research-only line. The scanner does not place live orders. It has no broker connection and it does not sign or send wallet transactions.

Each A or A+ line includes a volume check before the reason. `Volume: backing the move (1.8x average)` means the break or retest hour was meaningfully busier than the previous 20 traded hours. `Volume: not confirming (light, 0.6x average)` or `diverging` means do not treat that setup as stronger. The grade is still A or A+. Spot forex says volume is not available. The scanner does not invent a figure. See the scanner section of the README for how the multiple is calculated.

A lesson line is added when a paper idea hits its stop, its half target, or its 2R target, and when an open idea is flattened before the weekend.
