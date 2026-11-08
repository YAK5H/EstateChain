
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("EstateChain", function () {
  const NAME = "Maple Street";
  const SYMBOL = "MAPLE";
  const LOCATION = "Pune";
  const IMAGE_URL = "/images/maple.jpg";
  const PRICE = ethers.parseEther("0.01");
  const MAX_SUPPLY = 100n;

  async function deployEstateChainFixture() {
    const [owner, buyer, other, thirdParty] = await ethers.getSigners();

    const EstateChain = await ethers.getContractFactory("EstateChain");
    const estate = await EstateChain.deploy();

    return { estate, owner, buyer, other, thirdParty };
  }

  function registerArgs(overrides = {}) {
    return [
      overrides.name ?? NAME,
      overrides.symbol ?? SYMBOL,
      overrides.location ?? LOCATION,
      overrides.imageUrl ?? IMAGE_URL,
      overrides.price ?? PRICE,
      overrides.maxSupply ?? MAX_SUPPLY,
    ];
  }

  async function tokenFor(estate, propertyId) {
    const property = await estate.properties(propertyId);
    return ethers.getContractAt("PropertyToken", property.token);
  }

  async function buyTokens(estate, buyer, propertyId, amount, price = PRICE) {
    const tokenAmount = BigInt(amount);
    const cost = price * tokenAmount;

    await estate.connect(buyer).buyTokens(propertyId, tokenAmount, {
      value: cost,
    });

    return cost;
  }

  describe("property registration", function () {
    it("sets the deployer as admin and deploys one token per property", async function () {
      const { estate, owner } = await loadFixture(deployEstateChainFixture);

      await expect(estate.registerProperty(...registerArgs()))
        .to.emit(estate, "PropertyRegistered")
        .withArgs(
          1n,
          (address) => ethers.isAddress(address),
          owner.address,
          NAME,
          SYMBOL,
          PRICE,
          MAX_SUPPLY
        );

      expect(await estate.owner()).to.equal(owner.address);
      expect(await estate.propertyCount()).to.equal(1n);

      const property = await estate.properties(1);

      expect(property.name).to.equal(NAME);
      expect(property.location).to.equal(LOCATION);
      expect(property.imageUrl).to.equal(IMAGE_URL);
      expect(property.pricePerTokenWei).to.equal(PRICE);
      expect(property.maxSupply).to.equal(MAX_SUPPLY);
      expect(property.minted).to.equal(0n);
      expect(property.propertyOwner).to.equal(owner.address);
      expect(property.active).to.equal(true);

      const token = await tokenFor(estate, 1);

      expect(await token.name()).to.equal(NAME);
      expect(await token.symbol()).to.equal(SYMBOL);
      expect(await token.decimals()).to.equal(0n);
      expect(await token.marketplace()).to.equal(await estate.getAddress());

      await estate.registerProperty(
        ...registerArgs({ name: "Lake View", symbol: "LAKE" })
      );

      const first = await estate.properties(1);
      const second = await estate.properties(2);

      expect(second.token).to.not.equal(first.token);
      expect(second.name).to.equal("Lake View");
    });

    it("allows another wallet to register a property and sets them as its owner", async function () {
      const { estate, other } = await loadFixture(deployEstateChainFixture);

      await estate.connect(other).registerProperty(...registerArgs());

      const property = await estate.properties(1);

      expect(property.name).to.equal(NAME);
      expect(property.propertyOwner).to.equal(other.address);
      expect(await estate.propertyCount()).to.equal(1n);
    });
  });

  describe("token purchases and balances", function () {
    it("mints whole tokens and adds the purchase payment to the reserve", async function () {
      const { estate, buyer } = await loadFixture(deployEstateChainFixture);

      await estate.registerProperty(...registerArgs());

      const amount = 4n;
      const cost = PRICE * amount;

      await expect(
        estate.connect(buyer).buyTokens(1, amount, { value: cost })
      )
        .to.emit(estate, "TokensPurchased")
        .withArgs(1n, buyer.address, amount, cost);

      const token = await tokenFor(estate, 1);

      expect(await token.balanceOf(buyer.address)).to.equal(amount);
      expect(await token.totalSupply()).to.equal(amount);
      expect((await estate.properties(1)).minted).to.equal(amount);
      expect(await estate.buybackReserve(1)).to.equal(cost);
      expect(await estate.totalReservedForBuybacks()).to.equal(cost);
      expect(await ethers.provider.getBalance(await estate.getAddress())).to.equal(cost);
    });

    it("does not allow anyone except the marketplace to mint tokens", async function () {
      const { estate, buyer } = await loadFixture(deployEstateChainFixture);

      await estate.registerProperty(...registerArgs());

      const token = await tokenFor(estate, 1);

      await expect(
        token.connect(buyer).mint(buyer.address, 1)
      ).to.be.revertedWith("Only the marketplace can mint");
    });

    it("rejects a missing property, an inactive property, and a zero amount", async function () {
      const { estate, buyer } = await loadFixture(deployEstateChainFixture);

      await estate.registerProperty(...registerArgs());

      await expect(
        estate.connect(buyer).buyTokens(0, 1, { value: PRICE })
      ).to.be.revertedWith("Property does not exist");

      await expect(
        estate.connect(buyer).buyTokens(9, 1, { value: PRICE })
      ).to.be.revertedWith("Property does not exist");

      await estate.setActive(1, false);

      await expect(
        estate.connect(buyer).buyTokens(1, 1, { value: PRICE })
      ).to.be.revertedWith("Property is not active");

      await estate.setActive(1, true);

      await expect(
        estate.connect(buyer).buyTokens(1, 0, { value: 0n })
      ).to.be.revertedWith("Amount must be greater than zero");
    });

    it("prevents the admin from buying tokens", async function () {
      const { estate, owner } = await loadFixture(deployEstateChainFixture);

      await estate.registerProperty(...registerArgs());

      await expect(
        estate.connect(owner).buyTokens(1, 1, { value: PRICE })
      ).to.be.revertedWith("Admin cannot buy tokens");
    });
  });

  describe("incorrect ETH payments", function () {
    it("rejects payments lower or higher than the exact cost", async function () {
      const { estate, buyer } = await loadFixture(deployEstateChainFixture);

      await estate.registerProperty(...registerArgs());

      await expect(
        estate.connect(buyer).buyTokens(1, 2, { value: PRICE })
      ).to.be.revertedWith("Incorrect ETH payment");

      await expect(
        estate.connect(buyer).buyTokens(1, 2, {
          value: PRICE * 2n + 1n,
        })
      ).to.be.revertedWith("Incorrect ETH payment");

      const token = await tokenFor(estate, 1);

      expect(await token.balanceOf(buyer.address)).to.equal(0n);
      expect(await estate.buybackReserve(1)).to.equal(0n);
    });

    it("uses the updated price for future purchases", async function () {
      const { estate, buyer } = await loadFixture(deployEstateChainFixture);

      await estate.registerProperty(...registerArgs());

      const newPrice = ethers.parseEther("0.02");

      await estate.setPrice(1, newPrice);

      await expect(
        estate.connect(buyer).buyTokens(1, 1, { value: PRICE })
      ).to.be.revertedWith("Incorrect ETH payment");

      await buyTokens(estate, buyer, 1, 1, newPrice);

      const token = await tokenFor(estate, 1);

      expect(await token.balanceOf(buyer.address)).to.equal(1n);
      expect(await estate.buybackReserve(1)).to.equal(newPrice);
    });
  });

  describe("maximum supply", function () {
    it("rejects purchases exceeding the supply cap", async function () {
      const { estate, buyer, other } = await loadFixture(deployEstateChainFixture);

      await estate.registerProperty(...registerArgs());

      await expect(
        estate.connect(buyer).buyTokens(1, MAX_SUPPLY + 1n, {
          value: PRICE * (MAX_SUPPLY + 1n),
        })
      ).to.be.revertedWith("Exceeds maximum supply");

      await buyTokens(estate, buyer, 1, 60n);

      await expect(
        estate.connect(other).buyTokens(1, 41, { value: PRICE * 41n })
      ).to.be.revertedWith("Exceeds maximum supply");

      await buyTokens(estate, other, 1, 40n);

      expect((await estate.properties(1)).minted).to.equal(MAX_SUPPLY);

      const token = await tokenFor(estate, 1);

      expect(await token.balanceOf(buyer.address)).to.equal(60n);
      expect(await token.balanceOf(other.address)).to.equal(40n);
    });

    it("makes redeemed tokens available for purchase again", async function () {
      const { estate, buyer, other } = await loadFixture(deployEstateChainFixture);

      await estate.registerProperty(...registerArgs());

      await buyTokens(estate, buyer, 1, MAX_SUPPLY);

      const token = await tokenFor(estate, 1);

      await token.connect(buyer).approve(await estate.getAddress(), 20n);
      await estate.connect(buyer).sellTokens(1, 20n);

      expect((await estate.properties(1)).minted).to.equal(80n);
      expect(await token.totalSupply()).to.equal(80n);

      await buyTokens(estate, other, 1, 20n);

      expect((await estate.properties(1)).minted).to.equal(MAX_SUPPLY);
      expect(await token.totalSupply()).to.equal(MAX_SUPPLY);
      expect(await token.balanceOf(other.address)).to.equal(20n);
    });
  });

  describe("property owner and admin access", function () {
    it("allows the property owner and admin to manage a listing, but blocks unrelated wallets", async function () {
      const { estate, owner, buyer, other } = await loadFixture(deployEstateChainFixture);

      await estate.connect(other).registerProperty(...registerArgs());

      const newPrice = ethers.parseEther("0.02");

      await estate.connect(other).setPrice(1, newPrice);
      expect((await estate.properties(1)).pricePerTokenWei).to.equal(newPrice);

      await estate.connect(other).setActive(1, false);
      expect((await estate.properties(1)).active).to.equal(false);

      await estate.connect(owner).setPrice(1, PRICE);
      expect((await estate.properties(1)).pricePerTokenWei).to.equal(PRICE);

      await estate.connect(owner).setActive(1, true);
      expect((await estate.properties(1)).active).to.equal(true);

      await expect(
        estate.connect(buyer).setPrice(1, newPrice)
      ).to.be.revertedWith("Not authorized");

      await expect(
        estate.connect(buyer).setActive(1, false)
      ).to.be.revertedWith("Not authorized");
    });

    it("allows the admin to manage a property they registered but not buy its tokens", async function () {
      const { estate, owner } = await loadFixture(deployEstateChainFixture);

      await estate.registerProperty(...registerArgs());

      await estate.setPrice(1, ethers.parseEther("0.02"));
      await estate.setActive(1, false);

      await expect(
        estate.buyTokens(1, 1, { value: ethers.parseEther("0.02") })
      ).to.be.revertedWith("Admin cannot buy tokens");
    });
  });

  describe("platform buybacks", function () {
    it("requires the holder to approve tokens before selling", async function () {
      const { estate, buyer } = await loadFixture(deployEstateChainFixture);

      await estate.registerProperty(...registerArgs());
      await buyTokens(estate, buyer, 1, 5n);

      await expect(
        estate.connect(buyer).sellTokens(1, 2n)
      ).to.be.revertedWithCustomError(
        await tokenFor(estate, 1),
        "ERC20InsufficientAllowance"
      );
    });

    it("burns sold tokens and pays the holder from the property's reserve", async function () {
      const { estate, buyer } = await loadFixture(deployEstateChainFixture);

      await estate.registerProperty(...registerArgs());

      await buyTokens(estate, buyer, 1, 10n);

      const token = await tokenFor(estate, 1);
      const saleAmount = 4n;
      const payout = PRICE * saleAmount;

      await token.connect(buyer).approve(await estate.getAddress(), saleAmount);

      await expect(estate.connect(buyer).sellTokens(1, saleAmount))
        .to.emit(estate, "TokensSold")
        .withArgs(1n, buyer.address, saleAmount, payout);

      expect(await token.balanceOf(buyer.address)).to.equal(6n);
      expect(await token.totalSupply()).to.equal(6n);
      expect((await estate.properties(1)).minted).to.equal(6n);
      expect(await estate.buybackReserve(1)).to.equal(PRICE * 6n);
      expect(await estate.totalReservedForBuybacks()).to.equal(PRICE * 6n);
      expect(await ethers.provider.getBalance(await estate.getAddress())).to.equal(
        PRICE * 6n
      );
    });

    it("allows selling even when the property is inactive", async function () {
      const { estate, buyer } = await loadFixture(deployEstateChainFixture);

      await estate.registerProperty(...registerArgs());
      await buyTokens(estate, buyer, 1, 5n);

      await estate.setActive(1, false);

      const token = await tokenFor(estate, 1);

      await token.connect(buyer).approve(await estate.getAddress(), 2n);

      await expect(estate.connect(buyer).sellTokens(1, 2n))
        .to.emit(estate, "TokensSold")
        .withArgs(1n, buyer.address, 2n, PRICE * 2n);

      expect(await token.balanceOf(buyer.address)).to.equal(3n);
      expect((await estate.properties(1)).active).to.equal(false);
    });

    it("uses the current price when calculating the redemption payout", async function () {
      const { estate, buyer } = await loadFixture(deployEstateChainFixture);

      await estate.registerProperty(...registerArgs());

      await buyTokens(estate, buyer, 1, 10n);

      const newPrice = ethers.parseEther("0.02");
      await estate.setPrice(1, newPrice);

      const token = await tokenFor(estate, 1);

      await token.connect(buyer).approve(await estate.getAddress(), 5n);

      await expect(estate.connect(buyer).sellTokens(1, 5n))
        .to.emit(estate, "TokensSold")
        .withArgs(1n, buyer.address, 5n, newPrice * 5n);

      expect(await token.balanceOf(buyer.address)).to.equal(5n);
      expect((await estate.properties(1)).minted).to.equal(5n);
      expect(await estate.buybackReserve(1)).to.equal(PRICE * 10n - newPrice * 5n);
    });

    it("rejects a sale when the property's reserve is insufficient", async function () {
      const { estate, buyer } = await loadFixture(deployEstateChainFixture);

      await estate.registerProperty(...registerArgs());
      await buyTokens(estate, buyer, 1, 10n);

      await estate.setPrice(1, ethers.parseEther("0.02"));

      const token = await tokenFor(estate, 1);
      await token.connect(buyer).approve(await estate.getAddress(), 10n);

      await expect(
        estate.connect(buyer).sellTokens(1, 10n)
      ).to.be.revertedWith("Insufficient property buyback reserve");

      expect(await token.balanceOf(buyer.address)).to.equal(10n);
      expect((await estate.properties(1)).minted).to.equal(10n);
    });

    it("rejects a zero-token sale", async function () {
      const { estate, buyer } = await loadFixture(deployEstateChainFixture);

      await estate.registerProperty(...registerArgs());

      await expect(
        estate.connect(buyer).sellTokens(1, 0)
      ).to.be.revertedWith("Amount must be greater than zero");
    });

    it("prevents the admin from selling tokens", async function () {
      const { estate, owner } = await loadFixture(deployEstateChainFixture);

      await estate.registerProperty(...registerArgs());

      await expect(
        estate.connect(owner).sellTokens(1, 1)
      ).to.be.revertedWith("Admin cannot sell tokens");
    });

    
it("rejects selling more tokens than the holder owns", async function () {
  const { estate, buyer } = await loadFixture(deployEstateChainFixture);

  await estate.registerProperty(...registerArgs());
  await buyTokens(estate, buyer, 1, 5n);

  const token = await tokenFor(estate, 1);

  // Approve more tokens than the buyer actually owns.
  await token.connect(buyer).approve(await estate.getAddress(), 10n);

  // Add enough reserve so the reserve check passes.
  await estate.fundBuybackReserve(1, {
    value: PRICE * 10n,
  });

  await expect(
    estate.connect(buyer).sellTokens(1, 10n)
  ).to.be.revertedWithCustomError(token, "ERC20InsufficientBalance");

  // Verify that the failed transaction changed nothing.
  expect(await token.balanceOf(buyer.address)).to.equal(5n);
  expect(await token.totalSupply()).to.equal(5n);
  expect((await estate.properties(1)).minted).to.equal(5n);
  expect(await estate.buybackReserve(1)).to.equal(PRICE * 15n);
  expect(await token.allowance(
    buyer.address,
    await estate.getAddress()
  )).to.equal(10n);
});


    it("keeps buyback reserves isolated between properties", async function () {
      const { estate, buyer, other } = await loadFixture(deployEstateChainFixture);

      await estate.registerProperty(...registerArgs());

      await estate.registerProperty(
        ...registerArgs({ name: "Lake View", symbol: "LAKE" })
      );

      await buyTokens(estate, buyer, 1, 10n);
      await buyTokens(estate, other, 2, 20n);

      const token = await tokenFor(estate, 1);

      await token.connect(buyer).approve(await estate.getAddress(), 4n);

      await estate.connect(buyer).sellTokens(1, 4n);

      expect(await estate.buybackReserve(1)).to.equal(PRICE * 6n);
      expect(await estate.buybackReserve(2)).to.equal(PRICE * 20n);
      expect(await estate.totalReservedForBuybacks()).to.equal(PRICE * 26n);

      expect((await estate.properties(1)).minted).to.equal(6n);
      expect((await estate.properties(2)).minted).to.equal(20n);
    });

    it("keeps token balances and reserves unchanged when a buyback fails", async function () {
      const { estate, buyer } = await loadFixture(deployEstateChainFixture);

      await estate.registerProperty(...registerArgs());
      await buyTokens(estate, buyer, 1, 10n);

      const token = await tokenFor(estate, 1);

      await estate.setPrice(1, ethers.parseEther("0.02"));

      await token.connect(buyer).approve(await estate.getAddress(), 10n);

      const balanceBefore = await token.balanceOf(buyer.address);
      const supplyBefore = await token.totalSupply();
      const reserveBefore = await estate.buybackReserve(1);
      const totalReservedBefore = await estate.totalReservedForBuybacks();
      const allowanceBefore = await token.allowance(
        buyer.address,
        await estate.getAddress()
      );

      await expect(
        estate.connect(buyer).sellTokens(1, 10n)
      ).to.be.revertedWith("Insufficient property buyback reserve");

      expect(await token.balanceOf(buyer.address)).to.equal(balanceBefore);
      expect(await token.totalSupply()).to.equal(supplyBefore);
      expect((await estate.properties(1)).minted).to.equal(10n);
      expect(await estate.buybackReserve(1)).to.equal(reserveBefore);
      expect(await estate.totalReservedForBuybacks()).to.equal(totalReservedBefore);
      expect(
        await token.allowance(buyer.address, await estate.getAddress())
      ).to.equal(allowanceBefore);
    });
  });

  describe("buyback reserve funding", function () {
    it("allows the admin to fund a specific property's reserve", async function () {
      const { estate, owner } = await loadFixture(deployEstateChainFixture);

      await estate.registerProperty(...registerArgs());
      await estate.registerProperty(
        ...registerArgs({ name: "Lake View", symbol: "LAKE" })
      );

      const fundingAmount = ethers.parseEther("2");

      await expect(
        estate.fundBuybackReserve(1, { value: fundingAmount })
      )
        .to.emit(estate, "BuybackReserveFunded")
        .withArgs(1n, owner.address, fundingAmount);

      expect(await estate.buybackReserve(1)).to.equal(fundingAmount);
      expect(await estate.buybackReserve(2)).to.equal(0n);
      expect(await estate.totalReservedForBuybacks()).to.equal(fundingAmount);
      expect(await ethers.provider.getBalance(await estate.getAddress())).to.equal(
        fundingAmount
      );
    });

    it("rejects reserve funding from non-admin wallets", async function () {
      const { estate, buyer } = await loadFixture(deployEstateChainFixture);

      await estate.registerProperty(...registerArgs());

      await expect(
        estate.connect(buyer).fundBuybackReserve(1, { value: PRICE })
      )
        .to.be.revertedWithCustomError(estate, "OwnableUnauthorizedAccount")
        .withArgs(buyer.address);
    });

    it("rejects zero funding and nonexistent properties", async function () {
      const { estate } = await loadFixture(deployEstateChainFixture);

      await estate.registerProperty(...registerArgs());

      await expect(
        estate.fundBuybackReserve(1, { value: 0n })
      ).to.be.revertedWith("Funding amount must be greater than zero");

      await expect(
        estate.fundBuybackReserve(99, { value: PRICE })
      ).to.be.revertedWith("Property does not exist");
    });

    it("adds admin funding to the reserve already collected from purchases", async function () {
      const { estate, owner, buyer } = await loadFixture(deployEstateChainFixture);

      await estate.registerProperty(...registerArgs());

      await buyTokens(estate, buyer, 1, 2n);

      const extraFunding = ethers.parseEther("1");

      await estate.fundBuybackReserve(1, { value: extraFunding });

      expect(await estate.buybackReserve(1)).to.equal(PRICE * 2n + extraFunding);
      expect(await estate.totalReservedForBuybacks()).to.equal(
        PRICE * 2n + extraFunding
      );
      expect(await ethers.provider.getBalance(await estate.getAddress())).to.equal(
        PRICE * 2n + extraFunding
      );
      expect(owner.address).to.equal(await estate.owner());
    });

    it("prevents a property owner who is not the admin from funding the reserve", async function () {
      const { estate, other } = await loadFixture(deployEstateChainFixture);

      await estate.connect(other).registerProperty(...registerArgs());

      await expect(
        estate.connect(other).fundBuybackReserve(1, { value: PRICE })
      )
        .to.be.revertedWithCustomError(estate, "OwnableUnauthorizedAccount")
        .withArgs(other.address);
    });
  });

  describe("withdrawals", function () {
    it("prevents the admin from withdrawing ETH reserved for buybacks", async function () {
      const { estate, buyer } = await loadFixture(deployEstateChainFixture);

      await estate.registerProperty(...registerArgs());

      await buyTokens(estate, buyer, 1, 2n);

      await expect(
        estate.withdraw()
      ).to.be.revertedWith("No surplus ETH to withdraw");

      expect(await ethers.provider.getBalance(await estate.getAddress())).to.equal(
        PRICE * 2n
      );

      expect(await estate.totalReservedForBuybacks()).to.equal(PRICE * 2n);
    });

    it("rejects a withdrawal when the contract has no ETH", async function () {
      const { estate } = await loadFixture(deployEstateChainFixture);

      await expect(
        estate.withdraw()
      ).to.be.revertedWith("No surplus ETH to withdraw");
    });

    it("rejects a withdrawal from a wallet that is not the owner", async function () {
      const { estate, buyer, other } = await loadFixture(deployEstateChainFixture);

      await estate.registerProperty(...registerArgs());
      await buyTokens(estate, buyer, 1, 1n);

      await expect(
        estate.connect(other).withdraw()
      )
        .to.be.revertedWithCustomError(estate, "OwnableUnauthorizedAccount")
        .withArgs(other.address);

      expect(await ethers.provider.getBalance(await estate.getAddress())).to.equal(
        PRICE
      );
    });

    it("allows the admin to withdraw surplus ETH while preserving buyback reserves", async function () {
      const { estate, owner, buyer } = await loadFixture(deployEstateChainFixture);

      await estate.registerProperty(...registerArgs());
      await buyTokens(estate, buyer, 1, 2n);

      const estateAddress = await estate.getAddress();
      const reservedAmount = PRICE * 2n;
      const surplusAmount = ethers.parseEther("1");

      // Simulate ETH received outside the normal payable functions.
      await ethers.provider.send("hardhat_setBalance", [
        estateAddress,
        ethers.toQuantity(reservedAmount + surplusAmount),
      ]);

      expect(await ethers.provider.getBalance(estateAddress)).to.equal(
        reservedAmount + surplusAmount
      );

      const ownerBalanceBefore = await ethers.provider.getBalance(owner.address);

      const tx = await estate.connect(owner).withdraw();
      const receipt = await tx.wait();

      const gasCost = receipt.gasUsed * receipt.gasPrice;

      const ownerBalanceAfter = await ethers.provider.getBalance(owner.address);

      expect(ownerBalanceAfter - ownerBalanceBefore).to.equal(
        surplusAmount - gasCost
      );

      expect(await ethers.provider.getBalance(estateAddress)).to.equal(
        reservedAmount
      );

      expect(await estate.buybackReserve(1)).to.equal(reservedAmount);
      expect(await estate.totalReservedForBuybacks()).to.equal(reservedAmount);
    });

    it("prevents a property owner who is not the admin from withdrawing platform ETH", async function () {
      const { estate, other } = await loadFixture(deployEstateChainFixture);

      await estate.connect(other).registerProperty(...registerArgs());

      await expect(
        estate.connect(other).withdraw()
      )
        .to.be.revertedWithCustomError(estate, "OwnableUnauthorizedAccount")
        .withArgs(other.address);
    });
  });
});
