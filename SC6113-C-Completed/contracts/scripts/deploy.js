// Deploys RoleManager, ProjectEscrow and DisputeManager, wires them together, and writes
// deployments/<network>.json plus ABIs in deployments/abi/ for the backend (C) and frontend (D).
//
//   npx hardhat run scripts/deploy.js --network localhost
//   npx hardhat run scripts/deploy.js --network sepolia     (needs SEPOLIA_RPC_URL + PRIVATE_KEY)
//
// SEED_DEMO=true (local only): registers Hardhat account #1 as Client, #2 as Freelancer, #3 as Arbitrator.
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { ethers, network } = hre;

async function main() {
  const [deployer] = await ethers.getSigners();
  const out = {
    network: network.name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    contracts: {},
    setupTransactions: [],
  };

  async function deploy(name, args) {
    const c = await (await ethers.getContractFactory(name)).deploy(...args);
    const receipt = await c.deploymentTransaction().wait();
    out.contracts[name] = {
      address: await c.getAddress(),
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
      constructorArgs: args.map(String),
    };
    console.log(`${name.padEnd(16)} ${out.contracts[name].address}  gas=${receipt.gasUsed}`);
    return c;
  }

  async function record(label, txPromise) {
    const receipt = await (await txPromise).wait();
    out.setupTransactions.push({ label, txHash: receipt.hash, gasUsed: receipt.gasUsed.toString() });
    console.log(`  ${label.padEnd(36)} gas=${receipt.gasUsed}`);
  }

  const roles = await deploy("RoleManager", [deployer.address]);
  const escrow = await deploy("ProjectEscrow", [await roles.getAddress()]);
  const disputes = await deploy("DisputeManager", [await roles.getAddress(), await escrow.getAddress()]);
  await record("escrow.setDisputeManager", escrow.setDisputeManager(await disputes.getAddress()));

  if (process.env.SEED_DEMO === "true") {
    const [, client, freelancer, arbitrator] = await ethers.getSigners();
    await record("client.registerAsClient", roles.connect(client).registerAsClient());
    await record("freelancer.registerAsFreelancer", roles.connect(freelancer).registerAsFreelancer());
    await record("admin.grantRole(ARBITRATOR)", roles.grantRole(await roles.ARBITRATOR_ROLE(), arbitrator.address));
    out.demoAccounts = { admin: deployer.address, client: client.address, freelancer: freelancer.address, arbitrator: arbitrator.address };
  }

  const dir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(path.join(dir, "abi"), { recursive: true });
  fs.writeFileSync(path.join(dir, `${network.name}.json`), JSON.stringify(out, null, 2));
  for (const name of Object.keys(out.contracts)) {
    const { abi } = await hre.artifacts.readArtifact(name);
    fs.writeFileSync(path.join(dir, "abi", `${name}.json`), JSON.stringify(abi, null, 2));
  }
  console.log(`\nSaved deployments/${network.name}.json and deployments/abi/*.json`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
