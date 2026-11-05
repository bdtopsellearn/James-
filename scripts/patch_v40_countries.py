#!/usr/bin/env python3
"""V40: add a comprehensive ISO-3166-1 alpha-2 -> country name map so EVERY
delivery country resolves to a real name + flag (not just the ~52 curated ones)."""
import io

PATH = 'api-server.cjs'
s = io.open(PATH, 'r', encoding='utf-8', newline='').read()
CR = '\r\n'

ISO = {
"AD":"Andorra","AE":"United Arab Emirates","AF":"Afghanistan","AG":"Antigua and Barbuda","AI":"Anguilla","AL":"Albania","AM":"Armenia","AO":"Angola","AQ":"Antarctica","AR":"Argentina","AS":"American Samoa","AT":"Austria","AU":"Australia","AW":"Aruba","AX":"Aland Islands","AZ":"Azerbaijan",
"BA":"Bosnia and Herzegovina","BB":"Barbados","BD":"Bangladesh","BE":"Belgium","BF":"Burkina Faso","BG":"Bulgaria","BH":"Bahrain","BI":"Burundi","BJ":"Benin","BL":"Saint Barthelemy","BM":"Bermuda","BN":"Brunei","BO":"Bolivia","BQ":"Caribbean Netherlands","BR":"Brazil","BS":"Bahamas","BT":"Bhutan","BV":"Bouvet Island","BW":"Botswana","BY":"Belarus","BZ":"Belize",
"CA":"Canada","CC":"Cocos Islands","CD":"DR Congo","CF":"Central African Republic","CG":"Congo","CH":"Switzerland","CI":"Cote d'Ivoire","CK":"Cook Islands","CL":"Chile","CM":"Cameroon","CN":"China","CO":"Colombia","CR":"Costa Rica","CU":"Cuba","CV":"Cape Verde","CW":"Curacao","CX":"Christmas Island","CY":"Cyprus","CZ":"Czechia",
"DE":"Germany","DJ":"Djibouti","DK":"Denmark","DM":"Dominica","DO":"Dominican Republic","DZ":"Algeria",
"EC":"Ecuador","EE":"Estonia","EG":"Egypt","EH":"Western Sahara","ER":"Eritrea","ES":"Spain","ET":"Ethiopia",
"FI":"Finland","FJ":"Fiji","FK":"Falkland Islands","FM":"Micronesia","FO":"Faroe Islands","FR":"France",
"GA":"Gabon","GB":"United Kingdom","GD":"Grenada","GE":"Georgia","GF":"French Guiana","GG":"Guernsey","GH":"Ghana","GI":"Gibraltar","GL":"Greenland","GM":"Gambia","GN":"Guinea","GP":"Guadeloupe","GQ":"Equatorial Guinea","GR":"Greece","GS":"South Georgia","GT":"Guatemala","GU":"Guam","GW":"Guinea-Bissau","GY":"Guyana",
"HK":"Hong Kong","HM":"Heard and McDonald Islands","HN":"Honduras","HR":"Croatia","HT":"Haiti","HU":"Hungary",
"ID":"Indonesia","IE":"Ireland","IL":"Israel","IM":"Isle of Man","IN":"India","IO":"British Indian Ocean Territory","IQ":"Iraq","IR":"Iran","IS":"Iceland","IT":"Italy",
"JE":"Jersey","JM":"Jamaica","JO":"Jordan","JP":"Japan",
"KE":"Kenya","KG":"Kyrgyzstan","KH":"Cambodia","KI":"Kiribati","KM":"Comoros","KN":"Saint Kitts and Nevis","KP":"North Korea","KR":"South Korea","KW":"Kuwait","KY":"Cayman Islands","KZ":"Kazakhstan",
"LA":"Laos","LB":"Lebanon","LC":"Saint Lucia","LI":"Liechtenstein","LK":"Sri Lanka","LR":"Liberia","LS":"Lesotho","LT":"Lithuania","LU":"Luxembourg","LV":"Latvia","LY":"Libya",
"MA":"Morocco","MC":"Monaco","MD":"Moldova","ME":"Montenegro","MF":"Saint Martin","MG":"Madagascar","MH":"Marshall Islands","MK":"North Macedonia","ML":"Mali","MM":"Myanmar","MN":"Mongolia","MO":"Macao","MP":"Northern Mariana Islands","MQ":"Martinique","MR":"Mauritania","MS":"Montserrat","MT":"Malta","MU":"Mauritius","MV":"Maldives","MW":"Malawi","MX":"Mexico","MY":"Malaysia","MZ":"Mozambique",
"NA":"Namibia","NC":"New Caledonia","NE":"Niger","NF":"Norfolk Island","NG":"Nigeria","NI":"Nicaragua","NL":"Netherlands","NO":"Norway","NP":"Nepal","NR":"Nauru","NU":"Niue","NZ":"New Zealand",
"OM":"Oman",
"PA":"Panama","PE":"Peru","PF":"French Polynesia","PG":"Papua New Guinea","PH":"Philippines","PK":"Pakistan","PL":"Poland","PM":"Saint Pierre and Miquelon","PN":"Pitcairn Islands","PR":"Puerto Rico","PS":"Palestine","PT":"Portugal","PW":"Palau","PY":"Paraguay",
"QA":"Qatar",
"RE":"Reunion","RO":"Romania","RS":"Serbia","RU":"Russia","RW":"Rwanda",
"SA":"Saudi Arabia","SB":"Solomon Islands","SC":"Seychelles","SD":"Sudan","SE":"Sweden","SG":"Singapore","SH":"Saint Helena","SI":"Slovenia","SJ":"Svalbard and Jan Mayen","SK":"Slovakia","SL":"Sierra Leone","SM":"San Marino","SN":"Senegal","SO":"Somalia","SR":"Suriname","SS":"South Sudan","ST":"Sao Tome and Principe","SV":"El Salvador","SX":"Sint Maarten","SY":"Syria","SZ":"Eswatini",
"TC":"Turks and Caicos Islands","TD":"Chad","TF":"French Southern Territories","TG":"Togo","TH":"Thailand","TJ":"Tajikistan","TK":"Tokelau","TL":"Timor-Leste","TM":"Turkmenistan","TN":"Tunisia","TO":"Tonga","TR":"Turkey","TT":"Trinidad and Tobago","TV":"Tuvalu","TW":"Taiwan","TZ":"Tanzania",
"UA":"Ukraine","UG":"Uganda","UM":"U.S. Outlying Islands","US":"United States","UY":"Uruguay","UZ":"Uzbekistan",
"VA":"Vatican City","VC":"Saint Vincent and the Grenadines","VE":"Venezuela","VG":"British Virgin Islands","VI":"U.S. Virgin Islands","VN":"Vietnam","VU":"Vanuatu",
"WF":"Wallis and Futuna","WS":"Samoa",
"YE":"Yemen","YT":"Mayotte",
"ZA":"South Africa","ZM":"Zambia","ZW":"Zimbabwe",
}

lines = ["// \u2b50 V40: comprehensive ISO-3166-1 alpha-2 \u2192 country name map (covers ~250 territories).",
         "// Used as the fallback name for any delivery country not in the curated COUNTRY_LABELS,",
         "// so Impression History shows a real country name + flag for EVERY country.",
         "const ISO_COUNTRY_NAMES = {"]
items = sorted(ISO.items())
for i, (k, v) in enumerate(items):
    comma = ',' if i < len(items) - 1 else ''
    lines.append("  %s: '%s'%s" % (k, v.replace("'", "\\'"), comma))
lines.append("};")
iso_block = CR.join(lines) + CR + CR

anchor = "function countryInfo(code) {"
assert anchor in s, 'countryInfo anchor missing'
s = s.replace(anchor, iso_block + anchor, 1)

# Replace the fallback branch so unmapped-but-valid codes get a real name + emoji.
old_fb = CR.join([
"  const hit = COUNTRY_LABELS[cc];",
"  if (hit) return { code: cc, flag: hit[0], name: hit[1] };",
"  if (cc && cc !== 'XX') return { code: cc, flag: '\U0001F310', name: cc };",
"  return { code: 'XX', flag: '\U0001F310', name: 'Unknown' };",
])
new_fb = CR.join([
"  const hit = COUNTRY_LABELS[cc];",
"  if (hit) return { code: cc, flag: hit[0], name: hit[1] };",
"  // \u2b50 V40: fall back to the full ISO name map + a generated emoji flag so every",
"  // country renders correctly (previously unmapped countries showed just the code).",
"  if (cc && cc !== 'XX' && /^[A-Z]{2}$/.test(cc)) {",
"    const name = ISO_COUNTRY_NAMES[cc] || cc;",
"    let flag = '\U0001F310';",
"    try { flag = String.fromCodePoint(...[...cc].map((c) => 127397 + c.charCodeAt(0))); } catch (e) {}",
"    return { code: cc, flag, name };",
"  }",
"  return { code: 'XX', flag: '\U0001F310', name: 'Unknown' };",
])
assert old_fb in s, 'countryInfo fallback missing'
s = s.replace(old_fb, new_fb, 1)

io.open(PATH, 'w', encoding='utf-8', newline='').write(s)
print('patched ISO_COUNTRY_NAMES (%d countries) + countryInfo fallback' % len(ISO))
