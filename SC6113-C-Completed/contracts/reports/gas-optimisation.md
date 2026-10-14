| Optimisation | Before | After | Saving |
|---|---:|---:|---:|
| Project struct: naive (9 slots) vs packed (3 slots) | 203,405 | 88,781 | 56.4% |
| Document hash: storage vs event only | 44,205 | 23,434 | 47.0% |
| 20-iteration loop: i++ vs unchecked ++i | 26,190 | 26,188 | 0.0% |
| Failed call: require string vs custom error | 5,669 | 5,586 | 1.5% |
