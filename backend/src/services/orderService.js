
const mongoose = require("mongoose");
const MenuItem = require("../models/MenuItem");
const Order = require("../models/Order");
const Counter = require("../models/Counter");

const badRequest = (message) =>
  Object.assign(new Error(message), { status: 400 });

async function createOrder({
  customerName,
  phone,
  address,
  orderType,
  items,
  source,
}) {
  if (!customerName || !phone) {
    throw badRequest("customerName and phone are required");
  }

  if (!Array.isArray(items) || items.length === 0) {
    throw badRequest("items must be a non-empty array");
  }

  const type = orderType || "delivery";

  if (!["delivery", "pickup"].includes(type)) {
    throw badRequest("orderType must be delivery or pickup");
  }

  if (type === "delivery" && !address) {
    throw badRequest("address is required for delivery");
  }

  const lines = [];
  let total = 0;

  for (const { menuItem, quantity } of items) {
    const qty = Number(quantity);

    if (!mongoose.isValidObjectId(menuItem)) {
      throw badRequest(`Invalid menuItem id: ${menuItem}`);
    }

    if (!Number.isInteger(qty) || qty < 1) {
      throw badRequest("quantity must be a positive integer");
    }

    const dbItem = await MenuItem.findById(menuItem);

    if (!dbItem) {
      throw badRequest(`Menu item not found: ${menuItem}`);
    }

    if (!dbItem.available) {
      throw badRequest(`${dbItem.name} is currently unavailable`);
    }

    lines.push({
      menuItem: dbItem._id,
      name: dbItem.name,
      price: dbItem.price,
      quantity: qty,
    });

    total += dbItem.price * qty;
  }

  // Atomic counter: generates a different number for each order.
  const counter = await Counter.findByIdAndUpdate(
    "orderNumber",
    { $inc: { sequence: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  const orderNumber = String(counter.sequence);

  try {
    return await Order.create({
      orderNumber,
      customerName,
      phone,
      address: address || "",
      orderType: type,
      items: lines,
      total,
      source,
      estimatedMinutes: 30,
    });
  } catch (error) {
    // Avoid silently continuing after an order-number conflict.
    throw error;
  }
}

module.exports = { createOrder };
