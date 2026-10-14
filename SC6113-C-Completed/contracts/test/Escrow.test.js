const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

const ETH = (n) => ethers.parseEther(String(n));
const HASH = (s) => ethers.id(s);
const DAY = 24 * 60 * 60;

// enums mirrored from ProjectEscrow (Requirements §7 and §8)
const P = { None: 0n, Created: 1n, Accepted: 2n, Funded: 3n, Active: 4n, Disputed: 5n, Completed: 6n, Cancelled: 7n };
const M = { Pending: 0n, InProgress: 1n, Submitted: 2n, Rejected: 3n, Approved: 4n, Disputed: 5n, Resolved: 6n };

async function deployFixture() {
  const [admin, client, freelancer, arbitrator, outsider, arbitrator2] = await ethers.getSigners();
  const roles = await ethers.deployContract("RoleManager", [admin.address]);
  const escrow = await ethers.deployContract("ProjectEscrow", [roles]);
  const disputes = await ethers.deployContract("DisputeManager", [roles, escrow]);
  await escrow.setDisputeManager(disputes);

  await roles.connect(client).registerAsClient();
  await roles.connect(freelancer).registerAsFreelancer();
  await roles.grantRole(await roles.ARBITRATOR_ROLE(), arbitrator.address);
  await roles.grantRole(await roles.ARBITRATOR_ROLE(), arbitrator2.address);
  return { roles, escrow, disputes, admin, client, freelancer, arbitrator, arbitrator2, outsider };
}

// the requirements' example (§5.2): 10 ETH split 3 / 3 / 4
async function createdFixture() {
  const f = await deployFixture();
  const now = await time.latest();
  const deadline = now + 60 * DAY;
  const due = [now + 10 * DAY, now + 20 * DAY, now + 30 * DAY];
  await f.escrow.connect(f.client).createProjectWithMilestones(
    f.freelancer.address, deadline, HASH("project"), [ETH(3), ETH(3), ETH(4)], due, [HASH("m0"), HASH("m1"), HASH("m2")]
  );
  return { ...f, deadline, due };
}

async function activeFixture() {
  const f = await createdFixture();
  await f.escrow.connect(f.freelancer).acceptProject(1);
  await f.escrow.connect(f.client).fundProject(1, { value: ETH(10) });
  return f;
}

describe("RoleManager (FR-02, SR-01)", function () {
  it("deployer is admin; users self-register as Client / Freelancer", async function () {
    const { roles, admin, client, freelancer, outsider } = await loadFixture(deployFixture);
    expect((await roles.rolesOf(admin.address)).admin).to.equal(true);
    expect((await roles.rolesOf(client.address)).client).to.equal(true);
    expect((await roles.rolesOf(freelancer.address)).freelancer).to.equal(true);
    await expect(roles.connect(outsider).registerAsClient())
      .to.emit(roles, "UserRegistered").withArgs(outsider.address, await roles.CLIENT_ROLE());
    await expect(roles.connect(outsider).registerAsClient()).to.be.revertedWithCustomError(roles, "AlreadyRegistered");
  });

  it("only admin can authorise arbitrators, and arbitrators cannot register as parties", async function () {
    const { roles, arbitrator, outsider } = await loadFixture(deployFixture);
    await expect(roles.connect(outsider).grantRole(await roles.ARBITRATOR_ROLE(), outsider.address))
      .to.be.revertedWithCustomError(roles, "AccessControlUnauthorizedAccount");
    await expect(roles.connect(arbitrator).registerAsFreelancer()).to.be.revertedWithCustomError(roles, "ArbitratorCannotRegister");
  });

  it("revoking a role blocks the wallet in the escrow immediately", async function () {
    const { roles, escrow, client, freelancer } = await loadFixture(deployFixture);
    await roles.revokeRole(await roles.CLIENT_ROLE(), client.address);
    await expect(escrow.connect(client).createProject(freelancer.address, ETH(1), (await time.latest()) + DAY, HASH("x")))
      .to.be.revertedWithCustomError(escrow, "MissingRole");
  });
});

describe("Project setup (FR-03 to FR-07, BR-01 to BR-05, BR-14)", function () {
  it("creates a project with milestones whose total equals the project amount", async function () {
    const { escrow, client, freelancer } = await loadFixture(createdFixture);
    const p = await escrow.getProject(1);
    expect(p.client).to.equal(client.address);
    expect(p.freelancer).to.equal(freelancer.address);
    expect(p.totalAmount).to.equal(ETH(10));
    expect(p.allocatedAmount).to.equal(ETH(10));
    expect(p.milestoneCount).to.equal(3);
    expect(p.status).to.equal(P.Created);
    expect((await escrow.getMilestones(1)).map((m) => m.amount)).to.deep.equal([ETH(3), ETH(3), ETH(4)]);
  });

  it("supports createProject + addMilestone step by step and enforces BR-03", async function () {
    const { escrow, client, freelancer } = await loadFixture(deployFixture);
    const now = await time.latest();
    await expect(escrow.connect(client).createProject(freelancer.address, ETH(5), now + 30 * DAY, HASH("p")))
      .to.emit(escrow, "ProjectCreated").withArgs(1, client.address, freelancer.address, ETH(5), now + 30 * DAY, HASH("p"));
    await expect(escrow.connect(client).addMilestone(1, ETH(2), now + 10 * DAY, HASH("a")))
      .to.emit(escrow, "MilestoneAdded").withArgs(1, 0, ETH(2), now + 10 * DAY, HASH("a"));
    // sum below total: cannot accept or fund yet
    await expect(escrow.connect(freelancer).acceptProject(1)).to.be.revertedWithCustomError(escrow, "MilestoneTotalMismatch");
    await expect(escrow.connect(client).fundProject(1, { value: ETH(5) })).to.be.revertedWithCustomError(escrow, "MilestoneTotalMismatch");
    // sum above total: rejected
    await expect(escrow.connect(client).addMilestone(1, ETH(4), now + 10 * DAY, HASH("b"))).to.be.revertedWithCustomError(escrow, "MilestoneTotalMismatch");
    await escrow.connect(client).addMilestone(1, ETH(3), now + 20 * DAY, HASH("b"));
    await escrow.connect(freelancer).acceptProject(1);
  });

  it("validates inputs", async function () {
    const { escrow, client, freelancer, outsider } = await loadFixture(deployFixture);
    const now = await time.latest();
    const c = escrow.connect(client);
    await expect(c.createProject(client.address, ETH(1), now + DAY, HASH("x"))).to.be.revertedWithCustomError(escrow, "InvalidAddress");
    await expect(c.createProject(outsider.address, ETH(1), now + DAY, HASH("x"))).to.be.revertedWithCustomError(escrow, "MissingRole");
    await expect(c.createProject(freelancer.address, 0, now + DAY, HASH("x"))).to.be.revertedWithCustomError(escrow, "InvalidAmount");
    await expect(c.createProject(freelancer.address, ETH(1), now - 1, HASH("x"))).to.be.revertedWithCustomError(escrow, "InvalidDeadline");
    await expect(escrow.connect(freelancer).createProject(freelancer.address, ETH(1), now + DAY, HASH("x"))).to.be.revertedWithCustomError(escrow, "MissingRole");
    await c.createProject(freelancer.address, ETH(1), now + 10 * DAY, HASH("x"));
    await expect(c.addMilestone(1, 0, now + DAY, HASH("m"))).to.be.revertedWithCustomError(escrow, "InvalidAmount");
    await expect(c.addMilestone(1, ETH(1), now + 11 * DAY, HASH("m"))).to.be.revertedWithCustomError(escrow, "InvalidDeadline");
    await expect(escrow.connect(outsider).addMilestone(1, ETH(1), now + DAY, HASH("m"))).to.be.revertedWithCustomError(escrow, "NotAuthorized");
    await expect(c.createProjectWithMilestones(freelancer.address, now + 10 * DAY, HASH("x"), Array(21).fill(1n), Array(21).fill(now + DAY), Array(21).fill(HASH("m"))))
      .to.be.revertedWithCustomError(escrow, "TooManyMilestones");
    await expect(c.createProjectWithMilestones(freelancer.address, now + 10 * DAY, HASH("x"), [1n, 2n], [now + DAY], [HASH("m"), HASH("m")]))
      .to.be.revertedWithCustomError(escrow, "InvalidAmount");
  });

  it("accept then fund: CREATED → ACCEPTED → ACTIVE, escrow holds 10 ETH", async function () {
    const { escrow, client, freelancer, outsider } = await loadFixture(createdFixture);
    await expect(escrow.connect(outsider).acceptProject(1)).to.be.revertedWithCustomError(escrow, "NotAuthorized");
    await expect(escrow.connect(freelancer).acceptProject(1)).to.emit(escrow, "ProjectAccepted").withArgs(1, freelancer.address);
    expect((await escrow.getProject(1)).status).to.equal(P.Accepted);
    expect(await escrow.isFunded(1)).to.equal(false);

    await expect(escrow.connect(freelancer).fundProject(1, { value: ETH(10) })).to.be.revertedWithCustomError(escrow, "NotAuthorized");
    await expect(escrow.connect(client).fundProject(1, { value: ETH(9) })).to.be.revertedWithCustomError(escrow, "IncorrectDeposit");
    await expect(escrow.connect(client).fundProject(1, { value: ETH(10) }))
      .to.changeEtherBalances([client, escrow], [-ETH(10), ETH(10)]);
    const p = await escrow.getProject(1);
    expect(p.status).to.equal(P.Active);
    expect(p.escrowBalance).to.equal(ETH(10));
    expect(await escrow.isFunded(1)).to.equal(true);
  });

  it("fund then accept also works: CREATED → FUNDED → ACTIVE (BR-05)", async function () {
    const { escrow, client, freelancer } = await loadFixture(createdFixture);
    await escrow.connect(client).fundProject(1, { value: ETH(10) });
    expect((await escrow.getProject(1)).status).to.equal(P.Funded);
    await expect(escrow.connect(freelancer).submitMilestone(1, 0, HASH("x"))).to.be.revertedWithCustomError(escrow, "InvalidProjectStatus");
    await expect(escrow.connect(freelancer).acceptProject(1)).to.emit(escrow, "ProjectActivated").withArgs(1);
    expect((await escrow.getProject(1)).status).to.equal(P.Active);
  });

  it("no new milestones once accepted or active (BR-14), no double funding", async function () {
    const { escrow, client, freelancer, due } = await loadFixture(createdFixture);
    await escrow.connect(freelancer).acceptProject(1);
    await expect(escrow.connect(client).addMilestone(1, ETH(1), due[0], HASH("x"))).to.be.revertedWithCustomError(escrow, "InvalidProjectStatus");
    await escrow.connect(client).fundProject(1, { value: ETH(10) });
    await expect(escrow.connect(client).fundProject(1, { value: ETH(10) })).to.be.revertedWithCustomError(escrow, "InvalidProjectStatus");
  });

  it("client can cancel before work begins and is refunded, but not once ACTIVE (BR-13)", async function () {
    const { escrow, client, freelancer, due, deadline } = await loadFixture(createdFixture);
    await escrow.connect(client).fundProject(1, { value: ETH(10) });
    await expect(escrow.connect(freelancer).cancelProject(1)).to.be.revertedWithCustomError(escrow, "NotAuthorized");
    await expect(escrow.connect(client).cancelProject(1)).to.changeEtherBalances([client, escrow], [ETH(10), -ETH(10)]);
    expect((await escrow.getProject(1)).status).to.equal(P.Cancelled);

    await escrow.connect(client).createProjectWithMilestones(freelancer.address, deadline, HASH("p2"), [ETH(1)], [due[0]], [HASH("m")]);
    await escrow.connect(freelancer).acceptProject(2);
    await escrow.connect(client).fundProject(2, { value: ETH(1) });
    await expect(escrow.connect(client).cancelProject(2)).to.be.revertedWithCustomError(escrow, "InvalidProjectStatus");
  });
});

describe("Milestone workflow (FR-08 to FR-12, BR-06 to BR-10, BR-15)", function () {
  it("Scenario A: submit → approve pays the exact amount immediately, all milestones → COMPLETED", async function () {
    const { escrow, client, freelancer } = await loadFixture(activeFixture);
    const amounts = [ETH(3), ETH(3), ETH(4)];
    for (let i = 0; i < 3; i++) {
      await expect(escrow.connect(freelancer).startMilestone(1, i)).to.emit(escrow, "MilestoneStarted").withArgs(1, i);
      await expect(escrow.connect(freelancer).submitMilestone(1, i, HASH(`work${i}`)))
        .to.emit(escrow, "MilestoneSubmitted").withArgs(1, i, HASH(`work${i}`), false);
      await expect(escrow.connect(client).approveMilestone(1, i))
        .to.changeEtherBalances([escrow, freelancer], [-amounts[i], amounts[i]]);
    }
    const p = await escrow.getProject(1);
    expect(p.status).to.equal(P.Completed);
    expect(p.escrowBalance).to.equal(0);
    expect(await ethers.provider.getBalance(escrow)).to.equal(0);
  });

  it("emits approval and payment events (SI-05)", async function () {
    const { escrow, client, freelancer } = await loadFixture(activeFixture);
    await escrow.connect(freelancer).submitMilestone(1, 0, HASH("w"));
    await expect(escrow.connect(client).approveMilestone(1, 0))
      .to.emit(escrow, "MilestoneApproved").withArgs(1, 0, false)
      .and.to.emit(escrow, "PaymentReleased").withArgs(1, 0, freelancer.address, ETH(3));
  });

  it("a milestone is paid only once and cannot move backwards (BR-09, BR-15, SR-04, SR-05)", async function () {
    const { escrow, client, freelancer } = await loadFixture(activeFixture);
    await escrow.connect(freelancer).submitMilestone(1, 0, HASH("w"));
    await escrow.connect(client).approveMilestone(1, 0);
    await expect(escrow.connect(client).approveMilestone(1, 0)).to.be.revertedWithCustomError(escrow, "InvalidMilestoneStatus");
    await expect(escrow.connect(freelancer).submitMilestone(1, 0, HASH("w"))).to.be.revertedWithCustomError(escrow, "InvalidMilestoneStatus");
    await expect(escrow.connect(freelancer).resubmitMilestone(1, 0, HASH("w"))).to.be.revertedWithCustomError(escrow, "InvalidMilestoneStatus");
    await expect(escrow.connect(client).rejectMilestone(1, 0, HASH("r"))).to.be.revertedWithCustomError(escrow, "InvalidMilestoneStatus");
    await expect(escrow.connect(client).raiseDispute(1, 0, HASH("r"))).to.be.revertedWithCustomError(escrow, "InvalidMilestoneStatus");
  });

  it("only the right party can act on a milestone (BR-06, BR-08, SR-02)", async function () {
    const { escrow, client, freelancer, outsider, arbitrator } = await loadFixture(activeFixture);
    await expect(escrow.connect(client).submitMilestone(1, 0, HASH("w"))).to.be.revertedWithCustomError(escrow, "NotAuthorized");
    await expect(escrow.connect(outsider).startMilestone(1, 0)).to.be.revertedWithCustomError(escrow, "NotAuthorized");
    await escrow.connect(freelancer).submitMilestone(1, 0, HASH("w"));
    for (const s of [freelancer, outsider, arbitrator]) {
      await expect(escrow.connect(s).approveMilestone(1, 0)).to.be.revertedWithCustomError(escrow, "NotAuthorized");
      await expect(escrow.connect(s).rejectMilestone(1, 0, HASH("r"))).to.be.revertedWithCustomError(escrow, "NotAuthorized");
    }
    await expect(escrow.connect(client).approveMilestone(1, 7)).to.be.revertedWithCustomError(escrow, "InvalidMilestoneIndex");
  });

  it("cannot submit milestones of a project that is not active (BR-07)", async function () {
    const { escrow, freelancer } = await loadFixture(createdFixture);
    await escrow.connect(freelancer).acceptProject(1);
    await expect(escrow.connect(freelancer).submitMilestone(1, 0, HASH("w"))).to.be.revertedWithCustomError(escrow, "InvalidProjectStatus");
  });

  it("reject does not refund; freelancer revises and resubmits, then gets paid (§5.3)", async function () {
    const { escrow, client, freelancer } = await loadFixture(activeFixture);
    await escrow.connect(freelancer).submitMilestone(1, 0, HASH("v1"));
    await expect(escrow.connect(client).rejectMilestone(1, 0, HASH("missing pages")))
      .to.emit(escrow, "MilestoneRejected").withArgs(1, 0, HASH("missing pages"));
    expect((await escrow.getMilestone(1, 0)).status).to.equal(M.Rejected);
    expect((await escrow.getProject(1)).escrowBalance).to.equal(ETH(10)); // nothing refunded
    await expect(escrow.connect(freelancer).resubmitMilestone(1, 0, HASH("v2")))
      .to.emit(escrow, "MilestoneSubmitted").withArgs(1, 0, HASH("v2"), true);
    await expect(escrow.connect(client).approveMilestone(1, 0)).to.changeEtherBalance(freelancer, ETH(3));
  });

  it("freelancer can claim after a 7-day review period if the client stays silent", async function () {
    const { escrow, client, freelancer } = await loadFixture(activeFixture);
    await escrow.connect(freelancer).submitMilestone(1, 0, HASH("w"));
    await expect(escrow.connect(freelancer).claimAfterReview(1, 0)).to.be.revertedWithCustomError(escrow, "ReviewPeriodActive");
    await time.increase(7 * DAY);
    await expect(escrow.connect(client).claimAfterReview(1, 0)).to.be.revertedWithCustomError(escrow, "NotAuthorized");
    const tx = await escrow.connect(freelancer).claimAfterReview(1, 0);
    await expect(tx).to.emit(escrow, "MilestoneApproved").withArgs(1, 0, true);
    await expect(tx).to.changeEtherBalance(freelancer, ETH(3));
  });
});

describe("Disputes (FR-13, FR-14, BR-11, BR-12, SR-03)", function () {
  async function disputedFixture() {
    const f = await activeFixture();
    await f.escrow.connect(f.freelancer).submitMilestone(1, 0, HASH("w"));
    await f.escrow.connect(f.client).rejectMilestone(1, 0, HASH("bad"));
    await f.escrow.connect(f.freelancer).raiseDispute(1, 0, HASH("reason"));
    return f;
  }

  it("Scenario B: reject → freelancer disputes → project DISPUTED, funds frozen", async function () {
    const { escrow, disputes, client, freelancer } = await loadFixture(activeFixture);
    await escrow.connect(freelancer).submitMilestone(1, 0, HASH("w"));
    await escrow.connect(client).rejectMilestone(1, 0, HASH("bad"));
    await expect(escrow.connect(freelancer).raiseDispute(1, 0, HASH("reason")))
      .to.emit(escrow, "DisputeRaised").withArgs(1, 0, 1, freelancer.address)
      .and.to.emit(disputes, "DisputeOpened").withArgs(1, 1, 0, freelancer.address, ETH(3), HASH("reason"));
    expect((await escrow.getProject(1)).status).to.equal(P.Disputed);
    expect((await escrow.getMilestone(1, 0)).status).to.equal(M.Disputed);
    expect(await disputes.openDisputeCount()).to.equal(1);
    // BR-11: neither side can move the disputed milestone's money
    await expect(escrow.connect(client).approveMilestone(1, 0)).to.be.revertedWithCustomError(escrow, "InvalidMilestoneStatus");
    await expect(escrow.connect(freelancer).resubmitMilestone(1, 0, HASH("w"))).to.be.revertedWithCustomError(escrow, "InvalidMilestoneStatus");
    await expect(escrow.connect(client).cancelProject(1)).to.be.revertedWithCustomError(escrow, "InvalidProjectStatus");
  });

  it("other milestones keep working while one is disputed", async function () {
    const { escrow, client, freelancer } = await loadFixture(disputedFixture);
    await escrow.connect(freelancer).submitMilestone(1, 1, HASH("w1"));
    await expect(escrow.connect(client).approveMilestone(1, 1)).to.changeEtherBalance(freelancer, ETH(3));
  });

  it("client can dispute a submitted milestone, and an overdue one with no submission", async function () {
    const { escrow, client, due } = await loadFixture(activeFixture);
    await expect(escrow.connect(client).raiseDispute(1, 1, HASH("late"))).to.be.revertedWithCustomError(escrow, "NotOverdue");
    await time.increaseTo(due[1] + 1);
    await expect(escrow.connect(client).raiseDispute(1, 1, HASH("late"))).to.emit(escrow, "DisputeRaised");
  });

  it("only the two parties can raise disputes, and only escrow can open/execute them", async function () {
    const { escrow, disputes, freelancer, outsider, arbitrator } = await loadFixture(activeFixture);
    await escrow.connect(freelancer).submitMilestone(1, 0, HASH("w"));
    await expect(escrow.connect(outsider).raiseDispute(1, 0, HASH("x"))).to.be.revertedWithCustomError(escrow, "NotAuthorized");
    await expect(escrow.connect(arbitrator).raiseDispute(1, 0, HASH("x"))).to.be.revertedWithCustomError(escrow, "NotAuthorized");
    await expect(disputes.connect(outsider).openDispute(1, 0, outsider.address, HASH("x"))).to.be.revertedWithCustomError(disputes, "NotAuthorized");
    await expect(escrow.connect(arbitrator).executeResolution(1, 0, true)).to.be.revertedWithCustomError(escrow, "NotAuthorized");
  });

  it("parties submit evidence; outsiders cannot", async function () {
    const { disputes, client, freelancer, outsider } = await loadFixture(disputedFixture);
    await expect(disputes.connect(freelancer).submitEvidence(1, HASH("screens"))).to.emit(disputes, "EvidenceSubmitted").withArgs(1, freelancer.address, HASH("screens"));
    await disputes.connect(client).submitEvidence(1, HASH("spec"));
    await expect(disputes.connect(outsider).submitEvidence(1, HASH("x"))).to.be.revertedWithCustomError(disputes, "NotAuthorized");
  });

  it("arbitrator releases to the freelancer; project returns to ACTIVE", async function () {
    const { escrow, disputes, freelancer, arbitrator } = await loadFixture(disputedFixture);
    const tx = await disputes.connect(arbitrator).resolveDispute(1, true, HASH("decision"));
    await expect(tx).to.emit(disputes, "DisputeResolved").withArgs(1, 1, arbitrator.address, true, HASH("decision"))
      .and.to.emit(escrow, "PaymentReleased").withArgs(1, 0, freelancer.address, ETH(3));
    await expect(tx).to.changeEtherBalance(freelancer, ETH(3));
    expect((await escrow.getMilestone(1, 0)).status).to.equal(M.Resolved);
    expect((await escrow.getProject(1)).status).to.equal(P.Active);
    const d = await disputes.getDispute(1);
    expect(d.releasedToFreelancer).to.equal(true);
    expect(d.arbitrator).to.equal(arbitrator.address);
    expect(await disputes.openDisputeCount()).to.equal(0);
  });

  it("arbitrator refunds the client", async function () {
    const { escrow, disputes, client, arbitrator } = await loadFixture(disputedFixture);
    const tx = await disputes.connect(arbitrator).resolveDispute(1, false, HASH("decision"));
    await expect(tx).to.emit(escrow, "FundsRefunded").withArgs(1, 0, client.address, ETH(3));
    await expect(tx).to.changeEtherBalance(client, ETH(3));
  });

  it("unauthorised wallets and parties cannot resolve; a dispute is resolved once", async function () {
    const { disputes, roles, client, freelancer, outsider, arbitrator, arbitrator2 } = await loadFixture(disputedFixture);
    for (const s of [client, freelancer, outsider]) {
      await expect(disputes.connect(s).resolveDispute(1, true, HASH("x"))).to.be.revertedWithCustomError(disputes, "MissingRole");
    }
    await roles.revokeRole(await roles.ARBITRATOR_ROLE(), arbitrator2.address);
    await expect(disputes.connect(arbitrator2).resolveDispute(1, true, HASH("x"))).to.be.revertedWithCustomError(disputes, "MissingRole");
    await disputes.connect(arbitrator).resolveDispute(1, false, HASH("x"));
    await expect(disputes.connect(arbitrator).resolveDispute(1, true, HASH("x"))).to.be.revertedWithCustomError(disputes, "InvalidDisputeStatus");
  });

  it("an arbitrator who is a party to the project cannot decide it", async function () {
    const { escrow, disputes, roles, admin, freelancer, arbitrator } = await loadFixture(deployFixture);
    // admin grants the arbitrator role to a wallet that is already a client on a project
    await roles.connect(admin).grantRole(await roles.CLIENT_ROLE(), arbitrator.address);
    const now = await time.latest();
    await escrow.connect(arbitrator).createProjectWithMilestones(freelancer.address, now + 30 * DAY, HASH("p"), [ETH(1)], [now + 10 * DAY], [HASH("m")]);
    await escrow.connect(freelancer).acceptProject(1);
    await escrow.connect(arbitrator).fundProject(1, { value: ETH(1) });
    await escrow.connect(freelancer).submitMilestone(1, 0, HASH("w"));
    await escrow.connect(freelancer).raiseDispute(1, 0, HASH("r"));
    await expect(disputes.connect(arbitrator).resolveDispute(1, false, HASH("x"))).to.be.revertedWithCustomError(disputes, "ArbitratorIsParty");
  });

  it("a resolution can complete the project", async function () {
    const { escrow, disputes, client, freelancer, arbitrator } = await loadFixture(disputedFixture);
    for (const i of [1, 2]) {
      await escrow.connect(freelancer).submitMilestone(1, i, HASH("w"));
      await escrow.connect(client).approveMilestone(1, i);
    }
    expect((await escrow.getProject(1)).status).to.equal(P.Disputed);
    await expect(disputes.connect(arbitrator).resolveDispute(1, true, HASH("x"))).to.emit(escrow, "ProjectCompleted").withArgs(1);
    expect((await escrow.getProject(1)).status).to.equal(P.Completed);
  });
});

describe("Security and admin controls", function () {
  it("payment push that is rejected falls back to a withdrawable balance", async function () {
    const { escrow, roles, client } = await loadFixture(deployFixture);
    const wallet = await ethers.deployContract("RejectingReceiver", [escrow, roles]);
    const now = await time.latest();
    await escrow.connect(client).createProjectWithMilestones(wallet, now + 30 * DAY, HASH("p"), [ETH(1)], [now + 10 * DAY], [HASH("m")]);
    await wallet.accept(1);
    await escrow.connect(client).fundProject(1, { value: ETH(1) });
    await wallet.submit(1, 0);
    await wallet.setMode(1, 0);
    await expect(escrow.connect(client).approveMilestone(1, 0)).to.emit(escrow, "PaymentDeferred").withArgs(await wallet.getAddress(), ETH(1));
    expect(await escrow.pendingWithdrawals(wallet)).to.equal(ETH(1));
    expect((await escrow.getProject(1)).status).to.equal(P.Completed);
    await expect(wallet.pull()).to.be.revertedWithCustomError(escrow, "TransferFailed");
    await wallet.setMode(0, 0);
    await expect(wallet.pull()).to.changeEtherBalance(wallet, ETH(1));
    await expect(escrow.connect(client).withdraw()).to.be.revertedWithCustomError(escrow, "NothingToWithdraw");
  });

  it("re-entering the escrow from a payment is blocked by ReentrancyGuard", async function () {
    const { escrow, roles, client } = await loadFixture(deployFixture);
    const wallet = await ethers.deployContract("RejectingReceiver", [escrow, roles]);
    const now = await time.latest();
    await escrow.connect(client).createProjectWithMilestones(wallet, now + 30 * DAY, HASH("p"), [ETH(1), ETH(1)], [now + 10 * DAY, now + 10 * DAY], [HASH("a"), HASH("b")]);
    await wallet.accept(1);
    await escrow.connect(client).fundProject(1, { value: ETH(2) });
    await wallet.submit(1, 0);
    await wallet.submit(1, 1);
    await wallet.setMode(2, 1);
    await escrow.connect(client).approveMilestone(1, 0);
    const selector = escrow.interface.getError("ReentrancyGuardReentrantCall").selector;
    expect(await wallet.reentryError()).to.equal(selector);
    expect((await escrow.getMilestone(1, 1)).status).to.equal(M.Submitted); // untouched
  });

  it("escrow balance always equals the sum of unsettled milestones (SR-06)", async function () {
    const { escrow, disputes, client, freelancer, arbitrator } = await loadFixture(activeFixture);
    await escrow.connect(freelancer).submitMilestone(1, 0, HASH("w"));
    await escrow.connect(client).approveMilestone(1, 0);
    await escrow.connect(freelancer).submitMilestone(1, 1, HASH("w"));
    await escrow.connect(client).raiseDispute(1, 1, HASH("r"));
    await disputes.connect(arbitrator).resolveDispute(1, false, HASH("d"));
    expect((await escrow.getProject(1)).escrowBalance).to.equal(ETH(4));
    expect(await ethers.provider.getBalance(escrow)).to.equal(ETH(4));
  });

  it("pause blocks new projects and funding but not approvals or cancellation", async function () {
    const { escrow, client, freelancer, outsider, due, deadline } = await loadFixture(activeFixture);
    await expect(escrow.connect(outsider).pause()).to.be.revertedWithCustomError(escrow, "MissingRole");
    await escrow.pause();
    await expect(escrow.connect(client).createProject(freelancer.address, ETH(1), deadline, HASH("x"))).to.be.revertedWithCustomError(escrow, "EnforcedPause");
    await escrow.connect(freelancer).submitMilestone(1, 0, HASH("w"));
    await escrow.connect(client).approveMilestone(1, 0);
    await escrow.unpause();
    await escrow.connect(client).createProjectWithMilestones(freelancer.address, deadline, HASH("p2"), [ETH(1)], [due[0]], [HASH("m")]);
  });

  it("dispute manager is wired once by admin only; constructors reject zero addresses", async function () {
    const { escrow, roles, outsider } = await loadFixture(deployFixture);
    await expect(escrow.setDisputeManager(outsider.address)).to.be.revertedWithCustomError(escrow, "DisputeManagerAlreadySet");
    const fresh = await ethers.deployContract("ProjectEscrow", [roles]);
    await expect(fresh.connect(outsider).setDisputeManager(outsider.address)).to.be.revertedWithCustomError(fresh, "MissingRole");
    await expect(fresh.setDisputeManager(ethers.ZeroAddress)).to.be.revertedWithCustomError(fresh, "InvalidAddress");
    const E = await ethers.getContractFactory("ProjectEscrow");
    await expect(E.deploy(ethers.ZeroAddress)).to.be.revertedWithCustomError(E, "InvalidAddress");
    const D = await ethers.getContractFactory("DisputeManager");
    await expect(D.deploy(roles, ethers.ZeroAddress)).to.be.revertedWithCustomError(D, "InvalidAddress");
  });
});
