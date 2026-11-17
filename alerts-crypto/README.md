# Crypto alerts

`npm run crypto` appends A and A+ lines to `alerts-crypto/YYYY-MM-DD.md`. The date is Europe/London. Those dated files are local and are not committed.

Each file starts with the same research-only header as `alerts/`. The crypto scanner does not place live orders. It has no broker connection, no exchange connection, and it does not sign or send wallet transactions.

A line before 15:15 UK time ends with `WATCH ONLY (before 15:15 UK rule)`. That line is not a paper entry. From 15:15 UK the same setup can be written again without that tag, and then it counts toward the $200 risk book.

A lesson line is added when a paper idea hits its stop, its half target, or its 2R target. Weekend ideas stay open. Crypto trades all week.
