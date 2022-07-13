// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../interfaces/IComptroller.sol";

contract MockComptroller is IComptroller {
    address private _oracle;
    mapping(address => address[]) private _assets;
    mapping(address => bool) private _isListed;

    constructor(address oracle_) {
        _oracle = oracle_;
    }

    function oracle() external view override returns (address) {
        return _oracle;
    }

    function getAssetsIn(address account)
        external
        view
        override
        returns (address[] memory)
    {
        return _assets[account];
    }

    function pushAssetsIn(address account, address cTokenAddress) external {
        _assets[account].push(cTokenAddress);
    }

    function isMarketListed(address cTokenAddress)
        external
        view
        override
        returns (bool)
    {
        return _isListed[cTokenAddress];
    }

    function setMarketListed(address cTokenAddress, bool listed) external {
        _isListed[cTokenAddress] = listed;
    }
}
