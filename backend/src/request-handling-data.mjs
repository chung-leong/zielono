/**
 * Handle data request
 *
 * @param  {Request}  req
 * @param  {Response} res
 * @param  {function} next
 */
async function handleDataRequest(req, res, next) {
  try {
    throw new Error('TODO');
  } catch (err) {
    next(err);
  }
}

export {
  handleDataRequest,
};
