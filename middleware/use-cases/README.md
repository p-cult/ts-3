# use-cases/ — application layer

One action per file (`get-health.js`, later `create-task.js`, …).  
Orchestrates domain + data ports. **No HTTP.**

Adapters call `useCase.execute(...)`.
