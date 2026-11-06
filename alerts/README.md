# Alerts

`npm run scan` appends A and A+ lines to `alerts/YYYY-MM-DD.md`. The date is Europe/London. Those dated files are local and are not committed.

Each file starts with a research-only line. The scanner does not place live orders. It has no broker connection and it does not sign or send wallet transactions.

A new A or A+ line is pending. It becomes an open paper idea only after a Telegram reply of `placed`. `not placed` keeps it off the book until that side sets up again. A lesson line is added when an open idea hits its stop, its half target, or its 2R target, and when an open idea is flattened before the weekend.
