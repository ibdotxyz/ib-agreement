// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IPriceFeed.sol";

contract SimplePriceFeed is Ownable, IPriceFeed {
    address public immutable token;
    uint internal price;

    /**
     * @dev Sets the values for {token}.
     */
    constructor(address _token) {
        token = _token;
    }

    /**
     * @notice Set price
     */
    function setPrice(uint _price) external {
        price = _price;
    }

    /**
     * @notice Return the token. It should be the collateral token address from IB agreement.
     * @return the token address
     */
    function getToken() external view override returns (address) {
        return token;
    }

    /**
     * @notice Return the token latest price in USD.
     * @return the price, scaled by 1e18
     */
    function getPrice() external view override returns (uint256) {
        return price;
    }
}
