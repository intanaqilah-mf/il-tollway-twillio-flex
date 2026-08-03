const _post = async (url, requestInfo, options = {}) => {
  const promise = fetch(url, requestInfo).then((resp) => {
    if (options.noJson) return resp;
    return resp.json();
  });

  if (options.verbose && options.title) {
    promise
      .then(() => console.log(`[http] ${options.title} successful`))
      .catch((error) => console.error(`[http] ${options.title} failed:`, error));
  }

  return promise;
};

export const post = async (url, data = {}, options) =>
  _post(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    },
    options,
  );
