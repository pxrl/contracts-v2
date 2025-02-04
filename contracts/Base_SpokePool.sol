// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;
import "@eth-optimism/contracts/libraries/constants/Lib_PredeployAddresses.sol";

import "./Ovm_SpokePool.sol";

/**
 * @notice Base Spoke pool.
 */
contract Base_SpokePool is Ovm_SpokePool {
    /**
     * @notice Construct the OVM Base SpokePool.
     * @param _initialDepositId Starting deposit ID. Set to 0 unless this is a re-deployment in order to mitigate
     * relay hash collisions.
     * @param _crossDomainAdmin Cross domain admin to set. Can be changed by admin.
     * @param _hubPool Hub pool address to set. Can be changed by admin.
     */
    function initialize(
        uint32 _initialDepositId,
        address _crossDomainAdmin,
        address _hubPool
    ) public initializer {
        __OvmSpokePool_init(
            _initialDepositId,
            _crossDomainAdmin,
            _hubPool,
            Lib_PredeployAddresses.OVM_ETH,
            0x4200000000000000000000000000000000000006
        );
    }
}
