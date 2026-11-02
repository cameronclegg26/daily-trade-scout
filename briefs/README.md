# Briefs

`save_daily_brief` writes one markdown file per UTC date: `briefs/YYYY-MM-DD.md`.

Each file is educational market research for the Sabio Trade prop account and a small Phantom-wallet crypto sleeve. The agent does not place live orders. It has no broker connection and it does not sign or send wallet transactions.

A rerun on the same date overwrites that file. The tool also stores a copy in the agent host file store and tags a `daily-brief` artifact.
