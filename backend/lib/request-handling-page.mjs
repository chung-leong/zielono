/**
 * Handle page request
 *
 * @param  {Request}  req
 * @param  {Response} res
 * @param  {function} next
 */
async function handlePageRequest(req, res, next) {
  try {
    throw new Error('TODO');
  } catch (err) {
    next(err);
  }
}

export {
  handlePageRequest,
};
