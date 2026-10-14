// Runs the requirements' Scenario A (normal payment) and Scenario B (dispute) against an existing
// deployment (deploy.js with SEED_DEMO=true first) and logs every transaction to
// deployments/<network>-demo-transactions.json.
//   npx hardhat run scripts/demo-flow.js --network localhost
const fs = require("fs");
const path = require("path");
const { ethers, network } = require("hardhat");

async function main() {
  const dep = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "deployments", `${network.name}.json`)));
  const at = (name) => ethers.getContractAt(name, dep.contracts[name].address);
  const roles = await at("RoleManager");
  const escrow = await at("ProjectEscrow");
  const disputes = await at("DisputeManager");
  const [admin, client, freelancer, arbitrator] = await ethers.getSigners();
  const ETH = (n) => ethers.parseEther(String(n));
  const log = [];

  async function tx(scenario, type, actor, contract, p) {
    const r = await (await p).wait();
    log.push({ scenario, type, actor, contract, txHash: r.hash, block: r.blockNumber, gasUsed: r.gasUsed.toString() });
    console.log(`${scenario}  ${type.padEnd(30)} ${actor.padEnd(11)} gas=${String(r.gasUsed).padStart(7)}  ${r.hash}`);
  }

  const now = (await ethers.provider.getBlock("latest")).timestamp;
  const deadline = now + 60 * 86400;
  const due = [now + 10 * 86400, now + 20 * 86400, now + 30 * 86400];
  const pid = Number(await escrow.projectCount()) + 1;

  // Scenario A — normal payment flow (Requirements §20)
  await tx("A", "createProject", "client", "ProjectEscrow", escrow.connect(client).createProject(freelancer.address, ETH(10), deadline, ethers.id("logo-and-website")));
  await tx("A", "addMilestone #0 (3 ETH)", "client", "ProjectEscrow", escrow.connect(client).addMilestone(pid, ETH(3), due[0], ethers.id("m0-logo")));
  await tx("A", "addMilestone #1 (3 ETH)", "client", "ProjectEscrow", escrow.connect(client).addMilestone(pid, ETH(3), due[1], ethers.id("m1-pages")));
  await tx("A", "addMilestone #2 (4 ETH)", "client", "ProjectEscrow", escrow.connect(client).addMilestone(pid, ETH(4), due[2], ethers.id("m2-launch")));
  await tx("A", "acceptProject", "freelancer", "ProjectEscrow", escrow.connect(freelancer).acceptProject(pid));
  await tx("A", "fundProject (10 ETH)", "client", "ProjectEscrow", escrow.connect(client).fundProject(pid, { value: ETH(10) }));
  await tx("A", "startMilestone #0", "freelancer", "ProjectEscrow", escrow.connect(freelancer).startMilestone(pid, 0));
  await tx("A", "submitMilestone #0", "freelancer", "ProjectEscrow", escrow.connect(freelancer).submitMilestone(pid, 0, ethers.id("logo.zip")));
  await tx("A", "approveMilestone #0 → pays 3 ETH", "client", "ProjectEscrow", escrow.connect(client).approveMilestone(pid, 0));

  // Scenario B — dispute flow
  await tx("B", "submitMilestone #1", "freelancer", "ProjectEscrow", escrow.connect(freelancer).submitMilestone(pid, 1, ethers.id("pages-v1.zip")));
  await tx("B", "rejectMilestone #1", "client", "ProjectEscrow", escrow.connect(client).rejectMilestone(pid, 1, ethers.id("missing contact page")));
  await tx("B", "resubmitMilestone #1", "freelancer", "ProjectEscrow", escrow.connect(freelancer).resubmitMilestone(pid, 1, ethers.id("pages-v2.zip")));
  await tx("B", "rejectMilestone #1 (again)", "client", "ProjectEscrow", escrow.connect(client).rejectMilestone(pid, 1, ethers.id("still missing")));
  await tx("B", "raiseDispute #1", "freelancer", "ProjectEscrow", escrow.connect(freelancer).raiseDispute(pid, 1, ethers.id("page was delivered")));
  const disputeId = await disputes.disputeCount();
  await tx("B", "submitEvidence", "freelancer", "DisputeManager", disputes.connect(freelancer).submitEvidence(disputeId, ethers.id("screenshot.png")));
  await tx("B", "resolveDispute → release", "arbitrator", "DisputeManager", disputes.connect(arbitrator).resolveDispute(disputeId, true, ethers.id("decision: delivered")));

  await tx("A", "submitMilestone #2", "freelancer", "ProjectEscrow", escrow.connect(freelancer).submitMilestone(pid, 2, ethers.id("launch.zip")));
  await tx("A", "approveMilestone #2 → completes", "client", "ProjectEscrow", escrow.connect(client).approveMilestone(pid, 2));

  const p = await escrow.getProject(pid);
  console.log(`\nproject ${pid} status=${p.status} (6 = COMPLETED), escrow balance=${ethers.formatEther(p.escrowBalance)} ETH`);
  const file = path.join(__dirname, "..", "deployments", `${network.name}-demo-transactions.json`);
  fs.writeFileSync(file, JSON.stringify(log, null, 2));
  console.log(`Saved ${path.relative(process.cwd(), file)}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
