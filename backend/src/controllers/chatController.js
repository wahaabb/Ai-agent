
const { chatWithRestaurant } = require("../services/chatService");

exports.chat = async (req, res, next) => {
  try {
    const result = await chatWithRestaurant({
      message: req.body.message,
      history: req.body.history || [],
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
};
