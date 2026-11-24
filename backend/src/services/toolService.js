
const mongoose = require("mongoose");
const MenuItem = require("../models/MenuItem");
const Order = require("../models/Order");
const Complaint = require("../models/Complaint");
const orderService = require("./orderService");

const escapeRegex = (s) =>
  s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const slimItem = (item) => ({
  id: String(item._id),
  name: item.name,
  price: item.price,
  category: item.category,
  description: item.description,
  available: item.available,
});

// Groq Chat Completions tool definitions
const toolDefinitions = [

{
  type: "function",
  function: {
    name: "get_menu",
    description:
      "Get all currently available menu items and their prices. Use this when the customer asks to see the menu.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
},

  {
    type: "function",
    function: {
      name: "get_item_details",
      description:
        "Search for menu items by name. Use this to find item IDs and current prices before ordering.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_availability",
      description: "Check whether a menu item is available.",
      parameters: {
        type: "object",
        properties: {
          item_id: { type: "string" },
        },
        required: ["item_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_order",
      description:
        "Place an order only after the customer explicitly confirms the complete order summary, quantities, total, name, phone and delivery address when applicable.",
      parameters: {
        type: "object",
        properties: {
          customer_name: { type: "string" },
          phone: { type: "string" },
          order_type: {
            type: "string",
            enum: ["delivery", "pickup"],
          },
          address: { type: "string" },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                menu_item_id: { type: "string" },
                quantity: { type: "integer", minimum: 1 },
              },
              required: ["menu_item_id", "quantity"],
            },
          },
        },
        required: [
          "customer_name",
          "phone",
          "order_type",
          "items",
        ],
      },
    },
  },
  {
  type: "function",
  function: {
    name: "get_order_status",
    description:
      "Find an order using its numeric order number, MongoDB order ID, or customer phone number and return its status.",
    parameters: {
      type: "object",
      properties: {
        order_number: {
          type: "string",
          description: "The customer's numeric order number, such as 1042."
        },
        order_id: {
          type: "string",
          description: "The MongoDB order ID."
        },
        phone: {
          type: "string",
          description: "The customer's phone number."
        },
      },
      required: [],
    },
  },
  },
  {
    type: "function",
    function: {
      name: "create_complaint",
      description:
        "Record a customer complaint about a late order, missing or incorrect items, or food quality.",
      parameters: {
        type: "object",
        properties: {
          order_number: {
            type: "string",
            description: "The numeric order number given to the customer.",
          },
          customer_name: { type: "string" },
          phone: { type: "string" },
          order_id: { type: "string" },
          message: { type: "string" },
        },
        required: ["phone", "message"],
      },
    },
  },
];

const toolHandlers = {
  async get_menu({ category } = {}) {
    const filter = { available: true };

    if (category) {
      filter.category = new RegExp(
        `^${escapeRegex(category)}$`,
        "i"
      );
    }

    const items = await MenuItem.find(filter).sort({
      category: 1,
      name: 1,
    });

    return { items: items.map(slimItem) };
  },

  async get_item_details({ query }) {
    if (!query) throw new Error("query is required");

    const items = await MenuItem.find({
      name: new RegExp(escapeRegex(query), "i"),
    });

    return {
      items: items.map(slimItem),
      ...(items.length === 0
        ? { note: "No matching menu item found." }
        : {}),
    };
  },

  async check_availability({ item_id }) {
    if (!mongoose.isValidObjectId(item_id)) {
      throw new Error("Invalid item_id");
    }

    const item = await MenuItem.findById(item_id);
    if (!item) throw new Error("Menu item not found");

    return {
      id: String(item._id),
      name: item.name,
      available: item.available,
    };
  },

  async create_order({
    customer_name,
    phone,
    order_type,
    address,
    items,
  }) {
    const order = await orderService.createOrder({
      customerName: customer_name,
      phone,
      orderType: order_type,
      address,
      source: "ai_chat",
      items: (items || []).map((item) => ({
        menuItem: item.menu_item_id,
        quantity: item.quantity,
      })),
    });


    return {
      order_id: String(order._id),
      order_number: order.orderNumber,
      status: order.status,
      total: order.total,
      estimated_minutes: order.estimatedMinutes,
      estimated_completion_time: new Date(
        order.createdAt.getTime() +
        order.estimatedMinutes * 60 * 1000
      ).toISOString(),
      items: order.items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        price: item.price,
      })),
    };

  },


async get_order_status({ order_number, order_id, phone }) {
  let order;

  if (order_number) {
    order = await Order.findOne({
      orderNumber: String(order_number).trim(),
    });
  } else if (order_id) {
    if (!mongoose.isValidObjectId(order_id)) {
      throw new Error("Invalid order_id");
    }

    order = await Order.findById(order_id);
  } else if (phone) {
    order = await Order.findOne({ phone }).sort({
      createdAt: -1,
    });
  } else {
    throw new Error("Provide an order number or phone number.");
  }

  if (!order) return { found: false };

  const estimatedCompletion = new Date(
    order.createdAt.getTime() +
    order.estimatedMinutes * 60 * 1000
  );

  const remainingMinutes = Math.max(
    0,
    Math.ceil((estimatedCompletion.getTime() - Date.now()) / 60000)
  );

  return {
    found: true,
    order_number: order.orderNumber,
    status: order.status,
    total: order.total,
    estimated_minutes: order.estimatedMinutes,
    remaining_minutes: ["completed", "cancelled"].includes(order.status)
      ? null
      : remainingMinutes,
    items: order.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
    })),
    placed_at: order.createdAt,
    estimated_completion_time: estimatedCompletion.toISOString(),
  };
},


  async create_complaint({
    customer_name,
    phone,
    order_id,
    message,
  }) {
    const validOrderId =
      order_id && mongoose.isValidObjectId(order_id)
        ? order_id
        : null;

    const complaint = await Complaint.create({
      customerName: customer_name || "",
      phone,
      order: validOrderId,
      message,
    });

    return {
      complaint_id: String(complaint._id),
      status: complaint.status,
    };
  },
};

module.exports = { toolDefinitions, toolHandlers };
