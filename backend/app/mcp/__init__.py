"""Model Context Protocol server: Scripting Smith as a remote MCP connector.

Students add the connector in Claude or ChatGPT and get a tutor that can read
their own labs, code, runs and error history — and nothing else. Authorization
is delegated entirely to Zitadel (this package is an OAuth 2.1 *resource
server*, never an authorization server); see `auth.py`.

The teaching contract — explain, never hand over the answer — lives in
`server.py` as MCP `instructions` and prompts, and is enforced structurally in
`tools.py`: no tool returns a worked solution, and the only tool that executes
anything runs the student's own saved code.
"""
