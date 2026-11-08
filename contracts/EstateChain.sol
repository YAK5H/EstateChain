
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {PropertyToken} from "./PropertyToken.sol";

/// @title EstateChain
/// @notice Property listing and whole-token marketplace with platform buybacks.
/// @dev Tokens are simulated shares, not legal ownership of land.
contract EstateChain is Ownable, ReentrancyGuard {
    struct Property {
        uint256 id;
        string name;
        string location;
        string imageUrl;
        uint256 pricePerTokenWei;
        uint256 maxSupply;
        // Current outstanding tokens, not lifetime tokens ever minted.
        uint256 minted;
        address token;
        address propertyOwner;
        bool active;
    }

    uint256 public propertyCount;

    mapping(uint256 => Property) public properties;

    // ETH reserved for buybacks, tracked separately for each property.
    mapping(uint256 => uint256) public buybackReserve;

    // Sum of all property reserves. Admin cannot withdraw this amount.
    uint256 public totalReservedForBuybacks;

    event PropertyRegistered(
        uint256 indexed propertyId,
        address indexed token,
        address indexed propertyOwner,
        string name,
        string symbol,
        uint256 pricePerTokenWei,
        uint256 maxSupply
    );

    event TokensPurchased(
        uint256 indexed propertyId,
        address indexed buyer,
        uint256 amount,
        uint256 cost
    );

    event TokensSold(
        uint256 indexed propertyId,
        address indexed seller,
        uint256 amount,
        uint256 payout
    );

    event PropertyPriceUpdated(
        uint256 indexed propertyId,
        uint256 newPricePerTokenWei
    );

    event PropertyActiveStatusUpdated(
        uint256 indexed propertyId,
        bool active
    );

    event BuybackReserveFunded(
        uint256 indexed propertyId,
        address indexed funder,
        uint256 amount
    );

    event Withdrawn(address indexed owner, uint256 amount);

    constructor() Ownable(msg.sender) {}

    modifier onlyPropertyOwnerOrAdmin(uint256 propertyId) {
        Property storage property = _existingProperty(propertyId);

        require(
            msg.sender == property.propertyOwner || msg.sender == owner(),
            "Not authorized"
        );
        _;
    }

    /// @notice Anyone can list a property and deploy its individual token.
    function registerProperty(
        string calldata name,
        string calldata symbol,
        string calldata location,
        string calldata imageUrl,
        uint256 pricePerTokenWei,
        uint256 maxSupply
    ) external returns (uint256 propertyId) {
        require(bytes(name).length > 0, "Name is required");
        require(bytes(symbol).length > 0, "Symbol is required");
        require(bytes(location).length > 0, "Location is required");
        require(bytes(imageUrl).length > 0, "Image URL is required");
        require(pricePerTokenWei > 0, "Price must be greater than zero");
        require(maxSupply > 0, "Maximum supply must be greater than zero");

        propertyCount += 1;
        propertyId = propertyCount;

        PropertyToken token = new PropertyToken(
            name,
            symbol,
            address(this)
        );

        properties[propertyId] = Property({
            id: propertyId,
            name: name,
            location: location,
            imageUrl: imageUrl,
            pricePerTokenWei: pricePerTokenWei,
            maxSupply: maxSupply,
            minted: 0,
            token: address(token),
            propertyOwner: msg.sender,
            active: true
        });

        emit PropertyRegistered(
            propertyId,
            address(token),
            msg.sender,
            name,
            symbol,
            pricePerTokenWei,
            maxSupply
        );
    }

    /// @notice Buy whole tokens at the current listed price.
    /// @dev The purchase payment is added to that property's buyback reserve.
    function buyTokens(
        uint256 propertyId,
        uint256 amount
    ) external payable nonReentrant {
        require(msg.sender != owner(), "Admin cannot buy tokens");

        Property storage property = _existingProperty(propertyId);

        require(property.active, "Property is not active");
        require(amount > 0, "Amount must be greater than zero");
        require(
            property.minted + amount <= property.maxSupply,
            "Exceeds maximum supply"
        );

        uint256 cost = property.pricePerTokenWei * amount;
        require(msg.value == cost, "Incorrect ETH payment");

        property.minted += amount;
        buybackReserve[propertyId] += cost;
        totalReservedForBuybacks += cost;

        PropertyToken(property.token).mint(msg.sender, amount);

        emit TokensPurchased(propertyId, msg.sender, amount, cost);
    }

    /// @notice Sell approved tokens back to the platform at the current price.
    /// @dev Can be used even if the property is inactive.
    function sellTokens(
        uint256 propertyId,
        uint256 amount
    ) external nonReentrant {
        require(msg.sender != owner(), "Admin cannot sell tokens");

        Property storage property = _existingProperty(propertyId);

        require(amount > 0, "Amount must be greater than zero");

        uint256 payout = property.pricePerTokenWei * amount;

        require(
            buybackReserve[propertyId] >= payout,
            "Insufficient property buyback reserve"
        );

        // burnFrom checks that this contract has the seller's allowance.
        PropertyToken(property.token).burnFrom(msg.sender, amount);

        property.minted -= amount;
        buybackReserve[propertyId] -= payout;
        totalReservedForBuybacks -= payout;

        (bool sent,) = payable(msg.sender).call{value: payout}("");
        require(sent, "ETH payout failed");

        emit TokensSold(propertyId, msg.sender, amount, payout);
    }

    /// @notice Property owner or admin updates the current token price.
    function setPrice(
        uint256 propertyId,
        uint256 pricePerTokenWei
    ) external onlyPropertyOwnerOrAdmin(propertyId) {
        require(pricePerTokenWei > 0, "Price must be greater than zero");

        properties[propertyId].pricePerTokenWei = pricePerTokenWei;

        emit PropertyPriceUpdated(propertyId, pricePerTokenWei);
    }

    /// @notice Property owner or admin activates or deactivates a listing.
    function setActive(
        uint256 propertyId,
        bool active
    ) external onlyPropertyOwnerOrAdmin(propertyId) {
        properties[propertyId].active = active;

        emit PropertyActiveStatusUpdated(propertyId, active);
    }

    /// @notice Admin adds ETH to a property's buyback reserve.
    function fundBuybackReserve(
        uint256 propertyId
    ) external payable onlyOwner {
        _existingProperty(propertyId);

        require(msg.value > 0, "Funding amount must be greater than zero");

        buybackReserve[propertyId] += msg.value;
        totalReservedForBuybacks += msg.value;

        emit BuybackReserveFunded(propertyId, msg.sender, msg.value);
    }

    /// @notice Admin withdraws only ETH not reserved for buybacks.
    function withdraw() external onlyOwner nonReentrant {
        uint256 balance = address(this).balance;

        require(
            balance >= totalReservedForBuybacks,
            "Reserved funds exceed balance"
        );

        uint256 availableToWithdraw = balance - totalReservedForBuybacks;

        require(availableToWithdraw > 0, "No surplus ETH to withdraw");

        (bool sent,) = payable(owner()).call{value: availableToWithdraw}("");
        require(sent, "Withdrawal failed");

        emit Withdrawn(owner(), availableToWithdraw);
    }

    function _existingProperty(
        uint256 propertyId
    ) private view returns (Property storage property) {
        property = properties[propertyId];

        require(
            property.token != address(0),
            "Property does not exist"
        );
    }
}
