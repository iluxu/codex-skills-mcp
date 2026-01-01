# codex-skills-mcp

MCP server that exposes the Codex skills registry over JSON-RPC (stdio).

## Run locally

```
REGISTRY_URL=https://raw.githubusercontent.com/iluxu/codex-skills-registry/main/index.json \
  node server.js
```

## Tools

- `skills.search({ query, tags })`
- `skills.get({ name })`
- `skills.install({ name, version })`
- `skills.verify({ artifactUrl, sha256 })`

## Related repos

- Registry: https://github.com/iluxu/codex-skills-registry
- CLI: https://github.com/iluxu/codex-skill
