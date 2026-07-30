# domain/ — innermost circle

Pure business concepts and rules. **No I/O. No HTTP. No Sheets.**

Today: `profiles.js` (P1–P4 vocabulary).  
Slice 01+: taskid, identity, birth rules, role gates, entities.

**Dependency rule:** nothing inside `domain/` may `require` adapters, data, use-cases, or server.
