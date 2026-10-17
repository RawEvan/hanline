import { cpSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'public', 'vendor')
mkdirSync(out, { recursive: true })

const sherpa = join(root, 'node_modules', 'sherpa-onnx')
const wllama = join(root, 'node_modules', '@wllama', 'wllama', 'esm', 'wasm', 'wllama.wasm')

const files = [
  'sherpa-onnx-wasm-nodejs.js',
  'sherpa-onnx-wasm-nodejs.wasm',
  'sherpa-onnx-asr.js',
  'sherpa-onnx-tts.js',
  'sherpa-onnx-wave.js',
]

for (const name of files) {
  const from = join(sherpa, name)
  if (!existsSync(from)) throw new Error(`Missing ${from}`)
  cpSync(from, join(out, name))
}
if (!existsSync(wllama)) throw new Error(`Missing ${wllama}`)
cpSync(wllama, join(out, 'wllama.wasm'))
const browserPath = `var nodePath=(()=>{function norm(p){var abs=String(p).charAt(0)==="/";var parts=String(p).split("/");var out=[];for(var i=0;i<parts.length;i++){if(!parts[i]||parts[i]===".")continue;if(parts[i]===".."){if(out.length)out.pop()}else out.push(parts[i])}var body=out.join("/");return abs?"/"+body:(body||".")}function dirname(p){var s=String(p);var i=s.lastIndexOf("/");if(i<0)return".";if(i===0)return"/";return s.slice(0,i)}function basename(p){var s=String(p);var i=s.lastIndexOf("/");return i<0?s:s.slice(i+1)}function join(){var acc="";for(var i=0;i<arguments.length;i++){var seg=arguments[i];if(seg==null||seg==="")continue;acc=acc?acc+"/"+seg:String(seg)}return norm(acc||".")}function resolve(){var resolved="";var abs=false;for(var i=arguments.length-1;i>=0&&!abs;i--){var seg=arguments[i];if(!seg)continue;resolved=seg+"/"+resolved;abs=String(seg).charAt(0)==="/"}var out=norm(resolved||".");if(abs&&out.charAt(0)!=="/")out="/"+out;return out}function relative(from,to){var a=norm(from).split("/").filter(Boolean);var b=norm(to).split("/").filter(Boolean);var i=0;while(i<a.length&&i<b.length&&a[i]===b[i])i++;var up=[];for(var n=0;n<a.length-i;n++)up.push("..");return up.concat(b.slice(i)).join("/")}return{isAbsolute:function(p){return String(p).charAt(0)==="/"},normalize:norm,dirname:dirname,basename:basename,join:join,posix:{resolve:resolve,relative:relative}}})();`
const gluePath = join(out, 'sherpa-onnx-wasm-nodejs.js')
const glue = readFileSync(gluePath, 'utf8')
  .replace(
    'var ENVIRONMENT_IS_NODE=globalThis.process?.versions?.node&&globalThis.process?.type!="renderer";',
    'var ENVIRONMENT_IS_NODE=false;',
  )
  .replace('var nodePath=require("path");', browserPath)
  .replace(
    'if(!ENVIRONMENT_IS_NODE){throw new Error("NODERAWFS is currently only supported on Node.js environment.")}',
    '',
  )
  .replace(
    'for(var _key in NODERAWFS){FS[_key]=_wrapNodeError(NODERAWFS[_key])}',
    '',
  )
if (!glue.includes('ENVIRONMENT_IS_NODE=false')) throw new Error('Could not mark the speech engine as a browser build.')
if (glue.includes('require("path")')) throw new Error('node path require was not rewritten')
if (glue.includes('NODERAWFS is currently only supported')) throw new Error('node filesystem guard remains')
if (glue.includes('for(var _key in NODERAWFS)')) throw new Error('node filesystem still replaces the memory filesystem')
writeFileSync(gluePath, glue)
const bzipPath = join(root, 'node_modules', 'seek-bzip', 'lib', 'index.js')
const bzip = readFileSync(bzipPath, 'utf8')
const doubled = 'var newBuffer = new Buffer(this.buffer.length*2);'
const capped =
  'var next=this.buffer.length<536870912?this.buffer.length*2:this.buffer.length+67108864;if(next>2147483647)next=2147483647;var newBuffer = new Buffer(next);'
if (!bzip.includes(capped)) {
  if (!bzip.includes(doubled)) throw new Error('seek-bzip growth site changed')
  writeFileSync(bzipPath, bzip.replace(doubled, capped))
}
console.log('copied engine files to public/vendor')
