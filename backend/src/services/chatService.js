
const OpenAI = require("openai");
const { toolDefinitions, toolHandlers } = require("./toolService");

const client = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1",
});

const SYSTEM_PROMPT = `
You are a helpful restaurant ordering assistant.

CURRENCY:
- The restaurant operates in Pakistan.
- Always display prices in PKR or Rs.
- Never use ₹ or Indian rupees.

TIMEZONE:
- Always communicate dates and times in Pakistan Standard Time (PKT, UTC+5).
- Never display UTC to customers.

ORDER STATUS:
- pending means the order is awaiting restaurant confirmation.
- confirmed means the restaurant has accepted the order.
- preparing means food preparation has started.
- out_for_delivery means the order is with the delivery rider.
- completed means the order has been delivered or collected.
- cancelled means the order was cancelled.
- Never describe pending as preparing.
- Never promise delivery based only on an estimated preparation time.

LANGUAGE:
- Understand Urdu, English, and mixed Urdu-English.
- Match the language and style used by the customer.
- Whenever responding in Urdu, ALWAYS write Urdu using Roman Urdu (Latin letters).
- NEVER use Urdu script in responses.
- Keep English words, menu item names, and food names in their normal English spelling.
- For mixed Urdu-English conversations, naturally combine Roman Urdu and English.
- Keep responses natural, polite, and concise.
- Examples:
  - Instead of "آپ کیا آرڈر کرنا چاہیں گے؟"
    write "Aap kya order karna chahenge?"
  - Instead of "آپ کا آرڈر کنفرم ہو گیا ہے۔"
    write "Aapka order confirm ho gaya hai."

ORDERS:
- Use the menu tools to check real items, availability, and prices.
- Never invent menu items or prices.
- Collect the customer's name, phone number, order type, and delivery address when needed.
- Before placing an order, show the items, quantities, total, customer details, and delivery/pickup type.
- Place the order ONLY after the customer explicitly confirms the complete summary.
- Never claim an order was placed unless create_order succeeds.
- After successful booking, provide the numeric order number and estimated time.

ORDER TRACKING:
- Find orders using the numeric order number or phone number.
- Use actual returned order status and estimated remaining time.
- Do not promise an exact arrival time; explain that estimates may change.
- Never invent order details.

COMPLAINTS:
- You can record complaints about late orders, missing items, incorrect orders, or food quality.
- Collect the customer's phone number and a clear description.
- Use create_complaint to save the complaint.
- Confirm a complaint was recorded only after the tool succeeds.

TOOLS:
- Use tools whenever real menu, order, or complaint data is needed.
- Never pretend you accessed information that a tool did not return.
`;

async function chatWithRestaurant({ message, history = [] }) {
    if (typeof message !== "string" || !message.trim()) {
        throw Object.assign(new Error("message is required"), {
            status: 400,
        });
    }

    // Accept only ordinary user/assistant text from the conversation.
    const safeHistory = Array.isArray(history)
        ? history
            .filter(
                (item) =>
                    item &&
                    ["user", "assistant"].includes(item.role) &&
                    typeof item.content === "string"
            )
            .slice(-12)
            .map(({ role, content }) => ({ role, content }))
        : [];

    const messages = [
        { role: "system", content: SYSTEM_PROMPT },
        ...safeHistory,
        { role: "user", content: message.trim() },
    ];

    // Allow multiple tool calls, with a limit to prevent endless loops.
    for (let turn = 0; turn < 6; turn++) {
        const response = await client.chat.completions.create({
            model: "openai/gpt-oss-120b",
            messages,
            tools: toolDefinitions,
            tool_choice: "auto",
            temperature: 0.2,
        });

        const assistantMessage = response.choices[0].message;
        messages.push(assistantMessage);

        if (
            !assistantMessage.tool_calls ||
            assistantMessage.tool_calls.length === 0
        ) {
            return {
                reply:
                    assistantMessage.content ||
                    "Sorry, I couldn't prepare a response. Please try again.",
            };
        }

        for (const toolCall of assistantMessage.tool_calls) {
            const name = toolCall.function.name;
            const handler = toolHandlers[name];

            if (!handler) {
                messages.push({
                    role: "tool",
                    tool_call_id: toolCall.id,
                    content: JSON.stringify({ error: "Unknown tool" }),
                });
                continue;
            }

            try {
                const parsedArgs = JSON.parse(toolCall.function.arguments || "{}");

                const args = Object.fromEntries(
                    Object.entries(parsedArgs).filter(([, value]) => value !== null)
                );
                const result = await handler(args);

                messages.push({
                    role: "tool",
                    tool_call_id: toolCall.id,
                    content: JSON.stringify(result),
                });
            } catch (error) {
                messages.push({
                    role: "tool",
                    tool_call_id: toolCall.id,
                    content: JSON.stringify({
                        error: error.message || "Tool execution failed",
                    }),
                });
            }
        }
    }

    throw new Error("The assistant reached its tool-call limit. Please try again.");
}

module.exports = { chatWithRestaurant };
