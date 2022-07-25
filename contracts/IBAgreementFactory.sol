// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./IBAgreement.sol";

contract IBAgreementFactory is Ownable {
    address public immutable comptroller;
    address[] public ibAgreements;

    event IBAgreementCreated(address ibAgreement);

    constructor(address _comptroller) {
        comptroller = _comptroller;
    }

    function create(
        address _executor,
        address _borrower,
        address _governor,
        address _collateral,
        address _priceFeed,
        uint256 _collateralFactor,
        uint256 _liquidationFactor,
        uint256 _closeFactor,
        uint256 _collateralCap
    ) external onlyOwner returns (address) {
        IBAgreementV3 ibAgreement = new IBAgreementV3(
            _executor,
            _borrower,
            _governor,
            comptroller,
            _collateral,
            _priceFeed,
            _collateralFactor,
            _liquidationFactor,
            _closeFactor,
            _collateralCap
        );
        ibAgreements.push(address(ibAgreement));
        emit IBAgreementCreated(address(ibAgreement));
        return address(ibAgreement);
    }

    function getAllAgreements() external view returns (address[] memory) {
        return ibAgreements;
    }
}
