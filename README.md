# Iron Bank Agreement

## Concept

The IBAgreement provides a standard contract to achieve DAO-to-DAO loans. Currently IBAgreement only works in Iron Bank because it leverages Credit Limit, which is only available in Iron Bank.

## Roles

There are three roles in this agreement:

* Borrower: loanee, typically a defi protocol
* Executor: loaner, Iron Bank
* Governor: The joint admins from both Borrower and Executor.

> The governor can be a 2-2 Gnosis multisig contract and each party has one of the signer. It could set the new price feed of the collateral or the new collateral cap. Changing these values will require both parties to agree on since they might cause an unexpected liquidation.

## Parameters

Here are the parameters in one IBAgreement.

| Name               | Description                                                                    | Updatable             |
|--------------------|--------------------------------------------------------------------------------|-----------------------|
| collateral factor  | The ratio of maximum borrowing power to collateral                             | No                    |
| liquidation factor | The ratio of borrowing value to collateral value where liquidation can happen  | No                    |
| close factor       | The percentage of how much collateral could be liquidated at once              | No                    |
| collateral cap     | The maximum amount of collateral token, 0 for no cap                           | Yes, through governor |

> For example, a Borrower chooses WBTC as collateral and deposits 1 WBTC. The price of WBTC is $40,000, Collateral Factor (CF) is 50% and Liquidation Factor (LF) is 75%. Then the IB agreement allows to borrow assets up to $20,000 worth. If WBTC price is the same but the value of borrowing assets increase to more than $30,000, a liquidation could occur. The close factor is 50%, meaning 50% of collateral could be liquidated in one liquidation.

## Functions

### View Functions

#### debtUSD

Check the current debt this agreement owed. The return value is in USD and scaled by 1e18.

#### hypotheticalDebtUSD

Check the hypothetical debt this agreement will owe given the borrow amount. The return value is in USD and scaled by 1e18.

#### collateralUSD

Check the current collateral value that could be used for borrow in this agreement. The return value is in USD and scaled by 1e18.

```
collateralUSD = collateral * collateralFactor
```

#### hypotheticalCollateralUSD

Check the hypothetical collateral value that could be used for borrow in this agreement after withdraw. The return value is in USD and scaled by 1e18.

#### liquidationThreshold

Check the current collateral value that could be considered to prevent the liquidation in this agreement. The return value is in USD and scaled by 1e18.

```
liquidationThreshold = collateral * liquidationFactor
```

---

### Borrower Functions

#### borrow
Borrow assets with amount from Iron Bank.

#### borrowMax

According to the current collateral value, use all the borrowing power to borrow assets from Iron Bank.

#### withdraw

Withdraw collateral with amount.

#### repay

Repay the debt with amount.

#### repayFull

Fully repay the debt.

---

### Executor Functions

#### seize

Seize accidentally deposited ERC20 tokens.

#### liquidateWithExactCollateralAmount

Liquidate the borrower with exact collateral amount.

#### liquidateForExactRepayAmount

Liquidate the borrower for exact repayment amount.

#### setConverter

Set converters for the borrow markets.

#### pause

Pause the IBAgreement. If the IBAgreement is paused, borrowers can't borrow and withdraw collateral if there is stil debt.

#### unpause

Unpause the IBAgreement.

---

### Governor Functions

#### setCollateralCap

Set the collateral cap, 0 for no cap.

#### setPriceFeed

Set price feeds for the borrow markets.

## Installation

```
$ npm install
```

### Secret
You should setup a ```.env``` file based on the `env-template` file.

## Development

### Compile

```
$ npx hardhat compile
```

### Testing

```
$ npx hardhat test
```

### Formatting

```
$ npx prettier --write 'contracts/**/*.sol'
```
