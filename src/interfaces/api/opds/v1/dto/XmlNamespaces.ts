// @port-of komga/src/main/kotlin/org/gotson/komga/interfaces/api/opds/v1/dto/XmlNamespaces.kt@65981e600edb24944ffaae4818ff2716a5fa08dd

export const ATOM = 'http://www.w3.org/2005/Atom'
export const OPDS_PSE = 'http://vaemendis.net/opds-pse/ns'
export const OPENSEARCH = 'http://a9.com/-/spec/opensearch/1.1/'

export const prefixToNamespace = new Map<string, string>([['pse', OPDS_PSE]])
