# IronBank Agreement

## Concept

The IBAgreement provides a standard contract to achieve DAO-to-DAO loans. It currently only works on IronBank since it should leverage the credit limit.

## Roles

There are three roles in this agreement.

* The borrower: The loan applicant
* The executor: The loaner, Iron Bank
* The governor: The joint admin from both the borrower and the loaner.

> The governor can be a 2-2 Gnosis multisig contract and each party has one of the signer. It could set the new price feed of the collateral or the new converter when it comes to liquidation. Changing this will require both parties to agree on.

## APIs

### debtUSD

Check the current debt this agreement owed. The return value is in USD and scaled by 1e18.

### hypotheticalDebtUSD

Check the hypothetical debt this agreement will owe given the borrow amount. The return value is in USD and scaled by 1e18.

### collateralUSD

Check the current collateral value that could be used for borrow in this agreement. The return value is in USD and scaled by 1e18.

```
collateralUSD = collateral * collateralFactor
```

### hypotheticalCollateralUSD

Check the hypothetical collateral value that could be used for borrow in this agreement after withdraw. The return value is in USD and scaled by 1e18.

### liquidationThreshold

Check the current collateral value that could be considered to prevent the liquidation in this agreement. The return value is in USD and scaled by 1e18.

```
liquidationThreshold = collateral * liquidationFactor
```

### borrow

Borrow assets with amount from Iron Bank. It could only be called by the borrower.

### borrowMax

According to the current collateral value, use all the borrowing power to borrow assets from Iron Bank. It could only be called by the borrower.

### Withdraw

Withdraw collateral with amount. It could only be called by the borrower.

### Repay

Repay the debt with amount. It could only be called by the borrower.

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
