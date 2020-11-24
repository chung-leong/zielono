/**
 * Handle admin request
 *
 * @param  {Request}  req
 * @param  {Response} res
 * @param  {function} next
 */
async function handleAdminRequest(req, res, next) {
  res.type('text').send('Under construction');
}

export {
  handleAdminRequest,
};
