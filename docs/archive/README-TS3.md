# ts-3 — clean rebuild mirror

Parallel clean rebuild of the Param task system.

- **ts-2** = live / complex version (leave it alone unless asked)
- **ts-3** = rebuild from intent + thin technical foundation

## Read order

1. [ARCHITECTURE.md](ARCHITECTURE.md) — official system shape (Task ID, vehicle, depot, brain)  
2. [IMPROVEMENTS-TS3.md](IMPROVEMENTS-TS3.md) — why ts-3 will be better (short)  
3. [PLAN-CLEAN.md](PLAN-CLEAN.md) — refined rebuild plan (preserve / drop / birth / waves)  
4. [CAPABILITIES-FROM-TS2.md](CAPABILITIES-FROM-TS2.md) — live ts-2 inventory  
5. [FOUNDATION.md](FOUNDATION.md) — technical spine + target module layout  
6. [SLICE-01.md](SLICE-01.md) — first product slice (plan only)  
7. [MASTER.md](MASTER.md) — product truth  
8. [docs/reference/](docs/reference/) — requirements specs  

## Run foundation

```bash
./run.sh          # http://127.0.0.1:4303/
npm test          # spine checks
```

No login/tasks until Slice 01 is built.
