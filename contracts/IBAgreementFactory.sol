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
        uint256 _closeFactor
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
            _closeFactor
        );
        ibAgreements.push(address(ibAgreement));
        emit IBAgreementCreated(address(ibAgreement));
        return address(ibAgreement);
    }

    function count() external view returns (uint256) {
        return ibAgreements.length;
    }
}
