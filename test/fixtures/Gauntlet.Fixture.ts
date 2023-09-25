import { Contract, getContractFactory } from "../../utils/utils";
import { hre } from "../../utils/utils.hre";
import { spokePoolFixture } from "./SpokePool.Fixture";

const contractName = "Gauntlet";

export const gauntletFixture = hre.deployments.createFixture(async ({ ethers }) => {
  const [deployerWallet] = await ethers.getSigners();

  let collateralWhitelist: Contract | undefined = undefined;

  const { spokePool, erc20, weth } = await spokePoolFixture();

  console.log(`Deployerwasllet is ${deployerWallet}.`);
  const gauntlet = await hre.upgrades.deployProxy(
    await getContractFactory(contractName, deployerWallet),
    [spokePool.address],
    { kind: "uups", unsafeAllow: ["delegatecall"] }
  );

  return { gauntlet, erc20, weth };
});
