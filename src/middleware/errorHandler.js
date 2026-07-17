// Error handling middleware
const errorHandler = (err, req, res, next) => {
  console.error("Error:", err);

  // Default error
  let error = {
    success: false,
    message: err.message || "Internal Server Error",
    status: err.status || 500,
  };

  // Sequelize validation errors
  if (err.name === "SequelizeValidationError") {
    error.message = "Validation Error";
    error.status = 400;
    error.errors = err.errors.map((e) => ({
      field: e.path,
      message: e.message,
    }));
  }

  // Sequelize unique constraint errors
  if (err.name === "SequelizeUniqueConstraintError") {
    error.message = "Duplicate entry";
    error.status = 409;
    error.errors = err.errors.map((e) => ({
      field: e.path,
      message: "This value already exists",
    }));
  }

  // Sequelize foreign key constraint errors
  if (err.name === "SequelizeForeignKeyConstraintError") {
    error.message = "Referenced record not found";
    error.status = 400;
  }

  // JWT errors
  if (err.name === "JsonWebTokenError") {
    error.message = "Invalid token";
    error.status = 401;
  }

  if (err.name === "TokenExpiredError") {
    error.message = "Token expired";
    error.status = 401;
  }

  // Multer errors (file upload)
  if (err.code === "LIMIT_FILE_SIZE") {
    error.message = "File too large";
    error.status = 413;
  }

  if (err.code === "LIMIT_UNEXPECTED_FILE") {
    error.message = "Unexpected file field";
    error.status = 400;
  }

  // Don't leak error details in production
  if (process.env.NODE_ENV === "production" && error.status === 500) {
    error.message = "Something went wrong";
  }

  res.status(error.status).json(error);
};

module.exports = { errorHandler };
