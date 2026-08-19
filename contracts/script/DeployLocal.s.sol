// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script} from "forge-std/Script.sol";
import {EvidenceClaimRegistry} from "../src/EvidenceClaimRegistry.sol";

/// @notice Local-only bootstrap. The verifier is an Anvil development account, not an Attestcoin verifier.
contract DeployLocal is Script {
    function run() external returns (EvidenceClaimRegistry registry) {
        address verifier = vm.envAddress("LOCAL_VERIFIER_ADDRESS");
        vm.startBroadcast();
        registry = new EvidenceClaimRegistry(verifier);
        vm.stopBroadcast();
    }
}
