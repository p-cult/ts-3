# data/ — outer infrastructure

Persistence and external I/O only (memory now, Sheets/bridge later).

**Must not** contain business rules (who may edit, Task ID policy, role gates).  
Those live in `domain/` and `use-cases/`.

Use-cases depend on a **port** (methods like `ping`, later `saveTask`).  
This folder provides the **adapter** implementation.
