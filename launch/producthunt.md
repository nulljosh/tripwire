Name (<=40 chars):
Tripwire

Tagline (<=60 chars):
Know when an API breaks your code, before prod does.

Description (<=260 chars):
Tripwire watches the APIs you depend on and your own GitHub Actions. When a vendor ships a breaking change, it finds the calls in your repo and opens an issue with the diff. When CI goes red, it opens a PR with the fix already written.

Topics (3):
Developer Tools, Artificial Intelligence, Productivity

First comment (maker story):
Your CI goes red and you find out hours later, from a teammate or from GitHub's phone app. You dig through the log, find the one real line, fix it, push and wait again. Tripwire is my attempt to end that loop.

It has two halves. The first watches the APIs you depend on. A worker polls the vendor's OpenAPI spec on an hourly cron and keeps the last version. When it changes, it diffs the two: removed endpoints, dropped params, new required fields. Then it goes into your repo, finds the calls that just broke, and opens an issue that says which files call them.

The second watches your own GitHub Actions. When a run goes red, it opens one issue per red workflow and closes it when the run goes green. Claude Code then takes the issue in a throwaway Actions checkout, reproduces the failing step, fixes the root cause, re-runs it and opens the PR. If it is not a code problem, it says so on the issue.

A status page tells everyone the same thing. Tripwire tells you what broke in your code.

Setup, adding watches, secrets and testing are in DOCS.md. There is also a terminal client in tui/ if you live in the shell. Ask me anything in the comments.

Pricing line:
Free.

Links:
Web: https://tripwire.jaybulb.com
GitHub: https://github.com/nulljosh/tripwire
