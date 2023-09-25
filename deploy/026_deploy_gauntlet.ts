import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { deployNewProxy } from "../utils/utils.hre";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const contractName = "Gauntlet";
  const { deployments, getChainId } = hre;
  // const { deployments, getChainId, run } = hre;

  const chainId = parseInt(await getChainId());
  const spokePool = await deployments.get("SpokePool");
  console.log(`Using chain ${chainId} SpokePool @ ${spokePool.address}.`);

  const initArgs = [spokePool.address];
  await deployNewProxy(contractName, initArgs);
};
module.exports = func;
func.dependencies = ["SpokePool"];
func.tags = ["gauntlet", "mainnet"];
