/** No school profile model — pass through. */
const injectSchoolContext = async (req, res, next) => {
  req.school = null;
  next();
};

module.exports = { injectSchoolContext };
