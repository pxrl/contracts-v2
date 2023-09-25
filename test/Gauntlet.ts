import { constants as ethersConsts, utils as ethersUtils } from "ethers";
import { gauntletFixture } from "./fixtures/Gauntlet.Fixture";
import { Contract, ethers, seedWallet, SignerWithAddress, expect } from "../utils/utils";
import { amountToDeposit, amountToSeedWallets, depositRelayerFeePct } from "./constants";

const { Zero: bnZero } = ethersConsts;
const { arrayify, hexlify, zeroPad } = ethersUtils;

let gauntlet: Contract, erc20: Contract, weth: Contract;
let owner: SignerWithAddress, relayer: SignerWithAddress, recipient: SignerWithAddress;

const types = {
  auction: [
    { name: "id", type: "uint32" },
    // { name: "relayerFeePct", type: "string" },
    { name: "expiry", type: "uint32" },
  ],
};

function getDomain(chainId: number, version: number): Record<string, number | string> {
  return {
    name: "RelayerCartel",
    version: version.toString(),
    //verifyingContract: gauntlet.address,
    chainId,
  };
}

async function buildMessage(
  chainId: number,
  version = 0,
  auctionId: number,
  expiry: number,
  relayer: SignerWithAddress,
  recipient: SignerWithAddress
): Promise<[Uint8Array, string]> {
  const padLeft = 10;

  const domain = getDomain(chainId, version);
  const auction = {
    id: auctionId,
    // relayerFeePct,
    expiry,
  };

  const signature = await relayer._signTypedData(domain, types, auction);
  const signatureLen = arrayify(signature).length;

  const message = [
    ...zeroPad(arrayify(auctionId), 4),
    // ...zeroPad(arrayify(relayerFeePct), 32),
    ...zeroPad(arrayify(expiry), 4),
    ...arrayify(recipient.address),
    //...arrayify(relayer.address),
    ...arrayify(signature),
  ];
  console.log(
    `Built message from:\n` +
      `\t${"auctionId".padEnd(padLeft)} : ${auctionId}\n` +
      `\t${"expiry".padEnd(padLeft)} : ${expiry}\n` +
      `\t${"recipient".padEnd(padLeft)} : ${recipient.address}\n` +
      `\t${"relayer".padEnd(padLeft)} : ${relayer.address}\n` +
      `\t${"signature".padEnd(padLeft)} : ${signature} (${signatureLen} Bytes)\n` +
      `\t${"message".padEnd(padLeft)} : ${hexlify(message)} (${message.length} Bytes)\n`
  );
  return [message, signature];
}

describe("Gauntlet", function () {
  const version = 0;
  const relayerFeePct = "00010000000000";

  let chainId: number;
  let revertReason: string;

  let timestamp: number;
  let auctionId: number;

  beforeEach(async function () {
    [owner, relayer, recipient] = await ethers.getSigners();
    ({ gauntlet, erc20 } = await gauntletFixture());
    ({ chainId } = await gauntlet.provider.getNetwork());

    console.log(`Relayer: ${relayer.address}`);
    console.log(`Recipient: ${recipient.address}`);

    timestamp = Math.floor(Date.now() / 1000) + 60;
    auctionId = Math.round(Math.random() * 100000);

    await seedWallet(relayer, [erc20], undefined, amountToDeposit.mul(5));
    await erc20.connect(relayer).transfer(gauntlet.address, amountToDeposit);
  });

  it("Admin is set correctly", async function () {
    expect(await gauntlet.admin()).to.equal(owner.address);
  });

  it.skip("handleAcrossMessage() is restricted", async function () {
    const [message] = await buildMessage(chainId, version, auctionId, timestamp, relayer, recipient);
    const handleMessage = gauntlet
      .connect(recipient)
      .handleAcrossMessage(erc20.address, amountToDeposit, true, relayer.address, message);

    // @todo: This may not work as expected .
    await expect(handleMessage).to.be.revertedWith("Only SpokePool");
  });

  it.skip("Message: Unsupported version", async function () {
    revertReason = "Unsupported version";

    let [message] = await buildMessage(chainId, version + 1, auctionId, timestamp, relayer, recipient);
    let handleMessage = gauntlet.handleAcrossMessage(erc20.address, amountToDeposit, true, relayer.address, message);
    await expect(handleMessage).to.be.revertedWith(revertReason);

    [message] = await buildMessage(chainId, version, auctionId, timestamp, relayer, recipient);
    handleMessage = gauntlet.handleAcrossMessage(erc20.address, amountToDeposit, true, relayer.address, message);
    await expect(handleMessage).to.emit(gauntlet, "FillExecuted");
  });

  it("Valid relayer before expiry", async function () {
    expect(await erc20.balanceOf(gauntlet.address)).to.equal(amountToDeposit);
    expect(await erc20.balanceOf(recipient.address)).to.equal(bnZero);

    const [message, signature] = await buildMessage(chainId, version, auctionId, timestamp, relayer, recipient);
    await expect(
      gauntlet.connect(relayer).handleAcrossMessage(erc20.address, amountToDeposit, true, relayer.address, message)
    ).to.emit(gauntlet, "SignatureVerified");

    expect(await erc20.balanceOf(gauntlet.address)).to.equal(bnZero);
    expect(await erc20.balanceOf(recipient.address)).to.equal(amountToDeposit);
  });

  it("Invalid relayer before expiry", async function () {
    revertReason = "Invalid signature";
    const [message] = await buildMessage(chainId, version, auctionId, timestamp, recipient, recipient);
    await expect(
      gauntlet.handleAcrossMessage(erc20.address, amountToDeposit, true, relayer.address, message)
    ).to.be.revertedWith(revertReason);
  });

  it("Any relayer after expiry", async function () {
    timestamp = Math.round(Date.now() / 1000) - 120;

    expect(await erc20.balanceOf(gauntlet.address)).to.equal(amountToDeposit);
    expect(await erc20.balanceOf(recipient.address)).to.equal(bnZero);

    const [message] = await buildMessage(chainId, version, auctionId, timestamp, relayer, recipient);
    await expect(gauntlet.handleAcrossMessage(erc20.address, amountToDeposit, true, recipient.address, message))
      .to.emit(gauntlet, "FillExecuted")
      .withArgs(auctionId, recipient.address, timestamp);
    expect(await erc20.balanceOf(gauntlet.address)).to.equal(bnZero);
    expect(await erc20.balanceOf(recipient.address)).to.equal(amountToDeposit);
  });
});
