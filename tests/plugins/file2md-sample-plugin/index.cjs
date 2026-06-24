class RtfConverter {
  accepts(data, streamInfo) {
    return streamInfo.extension === ".rtf";
  }

  convert(data, streamInfo) {
    const text = new TextDecoder().decode(data);
    return { markdown: `RTF: ${text}`, title: null };
  }
}

module.exports = {
  registerConverters(file2md) {
    file2md.registerConverter(new RtfConverter());
  },
};
