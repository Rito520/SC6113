// npx hardhat run scripts/gas-bench.js  -> prints gas for each optimisation pair
const { ethers } = require("hardhat");

async function gas(txPromise) {
  return Number((await (await txPromise).wait()).gasUsed);
}

async function main() {
  const b = await ethers.deployContract("GasBench");
  const rows = [];
  rows.push(["Project struct: naive (9 slots) vs packed (3 slots)", await gas(b.storeNaive(1)), await gas(b.storePacked(1))]);
  rows.push(["Document hash: storage vs event only", await gas(b.hashInStorage(1, ethers.id("doc"))), await gas(b.hashInEvent(1, ethers.id("doc")))]);
  await b.loopChecked(20); await b.loopUnchecked(20); // warm both counters so the SSTORE cost is identical
  rows.push(["20-iteration loop: i++ vs unchecked ++i", await gas(b.loopChecked(20)), await gas(b.loopUnchecked(20))]);
  const [strCost, customCost] = await b.measureReverts.staticCall();
  rows.push(["Failed call: require string vs custom error", Number(strCost), Number(customCost)]);

  console.log("| Optimisation | Before | After | Saving |");
  console.log("|---|---:|---:|---:|");
  for (const [name, before, after] of rows) {
    const pct = (((before - after) / before) * 100).toFixed(1);
    console.log(`| ${name} | ${before.toLocaleString()} | ${after.toLocaleString()} | ${pct}% |`);
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
