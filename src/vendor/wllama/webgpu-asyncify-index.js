var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __knownSymbol = (name, symbol) => (symbol = Symbol[name]) ? symbol : Symbol.for("Symbol." + name);
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};
var __await = function(promise, isYieldStar) {
  this[0] = promise;
  this[1] = isYieldStar;
};
var __asyncGenerator = (__this, __arguments, generator) => {
  var resume = (k, v, yes, no) => {
    try {
      var x = generator[k](v), isAwait = (v = x.value) instanceof __await, done = x.done;
      Promise.resolve(isAwait ? v[0] : v).then((y) => isAwait ? resume(k === "return" ? k : "next", v[1] ? { done: y.done, value: y.value } : y, yes, no) : yes({ value: y, done })).catch((e) => resume("throw", e, yes, no));
    } catch (e) {
      no(e);
    }
  }, method = (k) => it[k] = (x) => new Promise((yes, no) => resume(k, x, yes, no)), it = {};
  return generator = generator.apply(__this, __arguments), it[__knownSymbol("asyncIterator")] = () => it, method("next"), method("throw"), method("return"), it;
};
var __forAwait = (obj, it, method) => (it = obj[__knownSymbol("asyncIterator")]) ? it.call(obj) : (obj = obj[__knownSymbol("iterator")](), it = {}, method = (key, fn) => (fn = obj[key]) && (it[key] = (arg) => new Promise((yes, no, done) => (arg = fn.call(obj, arg), done = arg.done, Promise.resolve(arg.value).then((value) => yes({ value, done }), no)))), method("next"), method("return"), it);

// src/glue/messages.ts
var GLUE_VERSION = 1;
var GLUE_MESSAGE_PROTOTYPES = {
  "erro_evt": {
    "name": "erro_evt",
    "structName": "glue_msg_error",
    "className": "GlueMsgError",
    "fields": [
      {
        "type": "str",
        "name": "message",
        "isNullable": false
      }
    ]
  },
  "load_req": {
    "name": "load_req",
    "structName": "glue_msg_load_req",
    "className": "GlueMsgLoadReq",
    "fields": [
      {
        "type": "arr_str",
        "name": "model_paths",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "n_ctx_auto",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "use_mmap",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "use_mlock",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_gpu_layers",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "seed",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_ctx",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_threads",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "embeddings",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "offload_kqv",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "n_batch",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "n_seq_max",
        "isNullable": true
      },
      {
        "type": "str",
        "name": "pooling_type",
        "isNullable": true
      },
      {
        "type": "str",
        "name": "rope_scaling_type",
        "isNullable": true
      },
      {
        "type": "float",
        "name": "rope_freq_base",
        "isNullable": true
      },
      {
        "type": "float",
        "name": "rope_freq_scale",
        "isNullable": true
      },
      {
        "type": "float",
        "name": "yarn_ext_factor",
        "isNullable": true
      },
      {
        "type": "float",
        "name": "yarn_attn_factor",
        "isNullable": true
      },
      {
        "type": "float",
        "name": "yarn_beta_fast",
        "isNullable": true
      },
      {
        "type": "float",
        "name": "yarn_beta_slow",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "yarn_orig_ctx",
        "isNullable": true
      },
      {
        "type": "str",
        "name": "cache_type_k",
        "isNullable": true
      },
      {
        "type": "str",
        "name": "cache_type_v",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "flash_attn",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "swa_full",
        "isNullable": true
      }
    ]
  },
  "load_res": {
    "name": "load_res",
    "structName": "glue_msg_load_res",
    "className": "GlueMsgLoadRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_ctx",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_batch",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_ubatch",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_vocab",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_ctx_train",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_embd",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_layer",
        "isNullable": false
      },
      {
        "type": "arr_str",
        "name": "metadata_key",
        "isNullable": false
      },
      {
        "type": "arr_str",
        "name": "metadata_val",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "token_bos",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "token_eos",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "token_eot",
        "isNullable": false
      },
      {
        "type": "arr_int",
        "name": "list_tokens_eog",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "add_bos_token",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "add_eos_token",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "has_encoder",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "token_decoder_start",
        "isNullable": false
      }
    ]
  },
  "opti_req": {
    "name": "opti_req",
    "structName": "glue_msg_set_options_req",
    "className": "GlueMsgSetOptionsReq",
    "fields": [
      {
        "type": "bool",
        "name": "embeddings",
        "isNullable": false
      }
    ]
  },
  "opti_res": {
    "name": "opti_res",
    "structName": "glue_msg_set_options_res",
    "className": "GlueMsgSetOptionsRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      }
    ]
  },
  "sint_req": {
    "name": "sint_req",
    "structName": "glue_msg_sampling_init_req",
    "className": "GlueMsgSamplingInitReq",
    "fields": [
      {
        "type": "int",
        "name": "mirostat",
        "isNullable": true
      },
      {
        "type": "float",
        "name": "mirostat_tau",
        "isNullable": true
      },
      {
        "type": "float",
        "name": "mirostat_eta",
        "isNullable": true
      },
      {
        "type": "float",
        "name": "temp",
        "isNullable": true
      },
      {
        "type": "float",
        "name": "top_p",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "top_k",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "penalty_last_n",
        "isNullable": true
      },
      {
        "type": "float",
        "name": "penalty_repeat",
        "isNullable": true
      },
      {
        "type": "float",
        "name": "penalty_freq",
        "isNullable": true
      },
      {
        "type": "float",
        "name": "penalty_present",
        "isNullable": true
      },
      {
        "type": "float",
        "name": "dynatemp_range",
        "isNullable": true
      },
      {
        "type": "float",
        "name": "dynatemp_exponent",
        "isNullable": true
      },
      {
        "type": "arr_str",
        "name": "samplers_sequence",
        "isNullable": true
      },
      {
        "type": "str",
        "name": "grammar",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "n_prev",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "n_probs",
        "isNullable": true
      },
      {
        "type": "float",
        "name": "min_p",
        "isNullable": true
      },
      {
        "type": "float",
        "name": "typical_p",
        "isNullable": true
      },
      {
        "type": "float",
        "name": "typ_p",
        "isNullable": true
      },
      {
        "type": "arr_int",
        "name": "logit_bias_toks",
        "isNullable": true
      },
      {
        "type": "arr_float",
        "name": "logit_bias_vals",
        "isNullable": true
      },
      {
        "type": "arr_int",
        "name": "tokens",
        "isNullable": true
      }
    ]
  },
  "sint_res": {
    "name": "sint_res",
    "structName": "glue_msg_sampling_init_res",
    "className": "GlueMsgSamplingInitRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      }
    ]
  },
  "gvoc_req": {
    "name": "gvoc_req",
    "structName": "glue_msg_get_vocab_req",
    "className": "GlueMsgGetVocabReq",
    "fields": []
  },
  "gvoc_res": {
    "name": "gvoc_res",
    "structName": "glue_msg_get_vocab_res",
    "className": "GlueMsgGetVocabRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      },
      {
        "type": "arr_raw",
        "name": "vocab",
        "isNullable": false
      }
    ]
  },
  "lkup_req": {
    "name": "lkup_req",
    "structName": "glue_msg_lookup_token_req",
    "className": "GlueMsgLookupTokenReq",
    "fields": [
      {
        "type": "str",
        "name": "piece",
        "isNullable": false
      }
    ]
  },
  "lkup_res": {
    "name": "lkup_res",
    "structName": "glue_msg_lookup_token_res",
    "className": "GlueMsgLookupTokenRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "token",
        "isNullable": false
      }
    ]
  },
  "tokn_req": {
    "name": "tokn_req",
    "structName": "glue_msg_tokenize_req",
    "className": "GlueMsgTokenizeReq",
    "fields": [
      {
        "type": "str",
        "name": "text",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "special",
        "isNullable": false
      }
    ]
  },
  "tokn_res": {
    "name": "tokn_res",
    "structName": "glue_msg_tokenize_res",
    "className": "GlueMsgTokenizeRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      },
      {
        "type": "arr_int",
        "name": "tokens",
        "isNullable": false
      }
    ]
  },
  "dtkn_req": {
    "name": "dtkn_req",
    "structName": "glue_msg_detokenize_req",
    "className": "GlueMsgDetokenizeReq",
    "fields": [
      {
        "type": "arr_int",
        "name": "tokens",
        "isNullable": false
      }
    ]
  },
  "dtkn_res": {
    "name": "dtkn_res",
    "structName": "glue_msg_detokenize_res",
    "className": "GlueMsgDetokenizeRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      },
      {
        "type": "raw",
        "name": "buffer",
        "isNullable": false
      }
    ]
  },
  "deco_req": {
    "name": "deco_req",
    "structName": "glue_msg_decode_req",
    "className": "GlueMsgDecodeReq",
    "fields": [
      {
        "type": "arr_int",
        "name": "tokens",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "skip_logits",
        "isNullable": false
      }
    ]
  },
  "deco_res": {
    "name": "deco_res",
    "structName": "glue_msg_decode_res",
    "className": "GlueMsgDecodeRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      },
      {
        "type": "str",
        "name": "message",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_past",
        "isNullable": false
      }
    ]
  },
  "enco_req": {
    "name": "enco_req",
    "structName": "glue_msg_encode_req",
    "className": "GlueMsgEncodeReq",
    "fields": [
      {
        "type": "arr_int",
        "name": "tokens",
        "isNullable": false
      }
    ]
  },
  "enco_res": {
    "name": "enco_res",
    "structName": "glue_msg_encode_res",
    "className": "GlueMsgEncodeRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      },
      {
        "type": "str",
        "name": "message",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_past",
        "isNullable": false
      }
    ]
  },
  "ssam_req": {
    "name": "ssam_req",
    "structName": "glue_msg_sampling_sample_req",
    "className": "GlueMsgSamplingSampleReq",
    "fields": []
  },
  "ssam_res": {
    "name": "ssam_res",
    "structName": "glue_msg_sampling_sample_res",
    "className": "GlueMsgSamplingSampleRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      },
      {
        "type": "raw",
        "name": "piece",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "token",
        "isNullable": false
      }
    ]
  },
  "sacc_req": {
    "name": "sacc_req",
    "structName": "glue_msg_sampling_accept_req",
    "className": "GlueMsgSamplingAcceptReq",
    "fields": [
      {
        "type": "arr_int",
        "name": "tokens",
        "isNullable": false
      }
    ]
  },
  "sacc_res": {
    "name": "sacc_res",
    "structName": "glue_msg_sampling_accept_res",
    "className": "GlueMsgSamplingAcceptRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      }
    ]
  },
  "glog_req": {
    "name": "glog_req",
    "structName": "glue_msg_get_logits_req",
    "className": "GlueMsgGetLogitsReq",
    "fields": [
      {
        "type": "int",
        "name": "top_k",
        "isNullable": false
      }
    ]
  },
  "glog_res": {
    "name": "glog_res",
    "structName": "glue_msg_get_logits_res",
    "className": "GlueMsgGetLogitsRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      },
      {
        "type": "arr_int",
        "name": "tokens",
        "isNullable": false
      },
      {
        "type": "arr_float",
        "name": "probs",
        "isNullable": false
      }
    ]
  },
  "gemb_req": {
    "name": "gemb_req",
    "structName": "glue_msg_get_embeddings_req",
    "className": "GlueMsgGetEmbeddingsReq",
    "fields": [
      {
        "type": "arr_int",
        "name": "tokens",
        "isNullable": false
      }
    ]
  },
  "gemb_res": {
    "name": "gemb_res",
    "structName": "glue_msg_get_embeddings_res",
    "className": "GlueMsgGetEmbeddingsRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      },
      {
        "type": "str",
        "name": "message",
        "isNullable": false
      },
      {
        "type": "arr_float",
        "name": "embeddings",
        "isNullable": false
      }
    ]
  },
  "kvcr_req": {
    "name": "kvcr_req",
    "structName": "glue_msg_get_kv_remove_req",
    "className": "GlueMsgGetKvRemoveReq",
    "fields": [
      {
        "type": "int",
        "name": "n_keep",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_discard",
        "isNullable": false
      }
    ]
  },
  "kvcr_res": {
    "name": "kvcr_res",
    "structName": "glue_msg_get_kv_remove_res",
    "className": "GlueMsgGetKvRemoveRes",
    "fields": [
      {
        "type": "int",
        "name": "n_past",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      }
    ]
  },
  "kvcc_req": {
    "name": "kvcc_req",
    "structName": "glue_msg_get_kv_clear_req",
    "className": "GlueMsgGetKvClearReq",
    "fields": []
  },
  "kvcc_res": {
    "name": "kvcc_res",
    "structName": "glue_msg_get_kv_clear_res",
    "className": "GlueMsgGetKvClearRes",
    "fields": [
      {
        "type": "int",
        "name": "n_past",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      }
    ]
  },
  "sesa_req": {
    "name": "sesa_req",
    "structName": "glue_msg_session_save_req",
    "className": "GlueMsgSessionSaveReq",
    "fields": [
      {
        "type": "str",
        "name": "session_path",
        "isNullable": false
      }
    ]
  },
  "sesa_res": {
    "name": "sesa_res",
    "structName": "glue_msg_session_save_res",
    "className": "GlueMsgSessionSaveRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      },
      {
        "type": "arr_int",
        "name": "tokens",
        "isNullable": false
      }
    ]
  },
  "sesl_req": {
    "name": "sesl_req",
    "structName": "glue_msg_session_load_req",
    "className": "GlueMsgSessionLoadReq",
    "fields": [
      {
        "type": "str",
        "name": "session_path",
        "isNullable": false
      },
      {
        "type": "arr_int",
        "name": "tokens",
        "isNullable": false
      }
    ]
  },
  "sesl_res": {
    "name": "sesl_res",
    "structName": "glue_msg_session_load_res",
    "className": "GlueMsgSessionLoadRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      }
    ]
  },
  "stat_req": {
    "name": "stat_req",
    "structName": "glue_msg_status_req",
    "className": "GlueMsgStatusReq",
    "fields": []
  },
  "stat_res": {
    "name": "stat_res",
    "structName": "glue_msg_status_res",
    "className": "GlueMsgStatusRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      },
      {
        "type": "arr_int",
        "name": "tokens",
        "isNullable": false
      }
    ]
  },
  "tben_req": {
    "name": "tben_req",
    "structName": "glue_msg_test_benchmark_req",
    "className": "GlueMsgTestBenchmarkReq",
    "fields": [
      {
        "type": "str",
        "name": "type",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_samples",
        "isNullable": false
      }
    ]
  },
  "tben_res": {
    "name": "tben_res",
    "structName": "glue_msg_test_benchmark_res",
    "className": "GlueMsgTestBenchmarkRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      },
      {
        "type": "str",
        "name": "message",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "t_ms",
        "isNullable": false
      }
    ]
  },
  "tper_req": {
    "name": "tper_req",
    "structName": "glue_msg_test_perplexity_req",
    "className": "GlueMsgTestPerplexityReq",
    "fields": [
      {
        "type": "arr_int",
        "name": "tokens",
        "isNullable": false
      }
    ]
  },
  "tper_res": {
    "name": "tper_res",
    "structName": "glue_msg_test_perplexity_res",
    "className": "GlueMsgTestPerplexityRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      },
      {
        "type": "str",
        "name": "message",
        "isNullable": false
      },
      {
        "type": "float",
        "name": "ppl",
        "isNullable": false
      },
      {
        "type": "float",
        "name": "nll",
        "isNullable": false
      },
      {
        "type": "float",
        "name": "cross_entropy",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_tokens",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "t_ms",
        "isNullable": false
      }
    ]
  },
  "cfmt_req": {
    "name": "cfmt_req",
    "structName": "glue_msg_chat_format_req",
    "className": "GlueMsgChatFormatReq",
    "fields": [
      {
        "type": "str",
        "name": "tmpl",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "add_ass",
        "isNullable": true
      },
      {
        "type": "arr_str",
        "name": "roles",
        "isNullable": false
      },
      {
        "type": "arr_str",
        "name": "contents",
        "isNullable": false
      }
    ]
  },
  "cfmt_res": {
    "name": "cfmt_res",
    "structName": "glue_msg_chat_format_res",
    "className": "GlueMsgChatFormatRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      },
      {
        "type": "str",
        "name": "message",
        "isNullable": false
      },
      {
        "type": "str",
        "name": "formatted_chat",
        "isNullable": false
      }
    ]
  }
};

// src/glue/glue.ts
var GLUE_MAGIC = new Uint8Array([71, 76, 85, 69]);
var GLUE_DTYPE_NULL = 0;
var GLUE_DTYPE_BOOL = 1;
var GLUE_DTYPE_INT = 2;
var GLUE_DTYPE_FLOAT = 3;
var GLUE_DTYPE_STRING = 4;
var GLUE_DTYPE_RAW = 5;
var GLUE_DTYPE_ARRAY_BOOL = 6;
var GLUE_DTYPE_ARRAY_INT = 7;
var GLUE_DTYPE_ARRAY_FLOAT = 8;
var GLUE_DTYPE_ARRAY_STRING = 9;
var GLUE_DTYPE_ARRAY_RAW = 10;
var TYPE_MAP = {
  str: GLUE_DTYPE_STRING,
  int: GLUE_DTYPE_INT,
  float: GLUE_DTYPE_FLOAT,
  bool: GLUE_DTYPE_BOOL,
  raw: GLUE_DTYPE_RAW,
  arr_str: GLUE_DTYPE_ARRAY_STRING,
  arr_int: GLUE_DTYPE_ARRAY_INT,
  arr_float: GLUE_DTYPE_ARRAY_FLOAT,
  arr_bool: GLUE_DTYPE_ARRAY_BOOL,
  arr_raw: GLUE_DTYPE_ARRAY_RAW,
  null: GLUE_DTYPE_NULL
};
function glueDeserialize(buf) {
  let offset = 0;
  const view = new DataView(buf.buffer);
  const readUint32 = () => {
    const value = view.getUint32(offset, true);
    offset += 4;
    return value;
  };
  const readInt32 = () => {
    const value = view.getInt32(offset, true);
    offset += 4;
    return value;
  };
  const readFloat = () => {
    const value = view.getFloat32(offset, true);
    offset += 4;
    return value;
  };
  const readBool = () => {
    return readUint32() !== 0;
  };
  const readString = (customLen) => {
    const length = customLen != null ? customLen : readUint32();
    const value = new TextDecoder().decode(buf.slice(offset, offset + length));
    offset += length;
    return value;
  };
  const readRaw = () => {
    const length = readUint32();
    const value = buf.slice(offset, offset + length);
    offset += length;
    return value;
  };
  const readArray = (readItem) => {
    const length = readUint32();
    const value = new Array(length);
    for (let i = 0; i < length; i++) {
      value[i] = readItem();
    }
    return value;
  };
  const readNull = () => null;
  const readField = (field) => {
    switch (field.type) {
      case "str":
        return readString();
      case "int":
        return readInt32();
      case "float":
        return readFloat();
      case "bool":
        return readBool();
      case "raw":
        return readRaw();
      case "arr_str":
        return readArray(readString);
      case "arr_int":
        return readArray(readInt32);
      case "arr_float":
        return readArray(readFloat);
      case "arr_bool":
        return readArray(readBool);
      case "arr_raw":
        return readArray(readRaw);
      case "null":
        return readNull();
    }
  };
  const magicValid = buf[0] === GLUE_MAGIC[0] && buf[1] === GLUE_MAGIC[1] && buf[2] === GLUE_MAGIC[2] && buf[3] === GLUE_MAGIC[3];
  offset += 4;
  if (!magicValid) {
    throw new Error("Invalid magic number");
  }
  const version = readUint32();
  if (version !== GLUE_VERSION) {
    throw new Error("Invalid version number");
  }
  const name = readString(8);
  const msgProto = GLUE_MESSAGE_PROTOTYPES[name];
  if (!msgProto) {
    throw new Error(`Unknown message name: ${name}`);
  }
  const output = { _name: name };
  for (const field of msgProto.fields) {
    const readType = readUint32();
    if (readType === GLUE_DTYPE_NULL) {
      if (!field.isNullable) {
        throw new Error(
          `${name}: Expect field ${field.name} to be non-nullable`
        );
      }
      output[field.name] = null;
      continue;
    }
    if (readType !== TYPE_MAP[field.type]) {
      throw new Error(
        `${name}: Expect field ${field.name} to have type ${field.type}`
      );
    }
    output[field.name] = readField(field);
  }
  return output;
}
function glueSerialize(msg) {
  const msgProto = GLUE_MESSAGE_PROTOTYPES[msg._name];
  if (!msgProto) {
    throw new Error(`Unknown message name: ${msg._name}`);
  }
  const bufs = [];
  const writeUint32 = (value) => {
    const buf = new ArrayBuffer(4);
    new DataView(buf).setUint32(0, value, true);
    bufs.push(new Uint8Array(buf));
  };
  const writeInt32 = (value) => {
    const buf = new ArrayBuffer(4);
    new DataView(buf).setInt32(0, value, true);
    bufs.push(new Uint8Array(buf));
  };
  const writeFloat = (value) => {
    const buf = new ArrayBuffer(4);
    new DataView(buf).setFloat32(0, value, true);
    bufs.push(new Uint8Array(buf));
  };
  const writeBool = (value) => {
    writeUint32(value ? 1 : 0);
  };
  const writeString = (value) => {
    const utf8 = new TextEncoder().encode(value);
    writeUint32(utf8.byteLength);
    bufs.push(utf8);
  };
  const writeRaw = (value) => {
    writeUint32(value.byteLength);
    bufs.push(value);
  };
  const writeArray = (value, writeItem) => {
    writeUint32(value.length);
    for (const item of value) {
      writeItem(item);
    }
  };
  const writeNull = () => {
  };
  bufs.push(GLUE_MAGIC);
  writeUint32(GLUE_VERSION);
  {
    const utf8 = new TextEncoder().encode(msg._name);
    bufs.push(utf8);
  }
  for (const field of msgProto.fields) {
    const val = msg[field.name];
    if (!field.isNullable && (val === null || val === void 0)) {
      throw new Error(
        `${msg._name}: Expect field ${field.name} to be non-nullable`
      );
    }
    if (val === null || val === void 0) {
      writeUint32(GLUE_DTYPE_NULL);
      continue;
    }
    writeUint32(TYPE_MAP[field.type]);
    switch (field.type) {
      case "str":
        writeString(val);
        break;
      case "int":
        writeInt32(val);
        break;
      case "float":
        writeFloat(val);
        break;
      case "bool":
        writeBool(val);
        break;
      case "raw":
        writeRaw(val);
        break;
      case "arr_str":
        writeArray(val, writeString);
        break;
      case "arr_int":
        writeArray(val, writeInt32);
        break;
      case "arr_float":
        writeArray(val, writeFloat);
        break;
      case "arr_bool":
        writeArray(val, writeBool);
        break;
      case "arr_raw":
        writeArray(val, writeRaw);
        break;
      case "null":
        writeNull();
        break;
    }
  }
  const totalLength = bufs.reduce((acc, buf) => acc + buf.byteLength, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;
  for (const buf of bufs) {
    output.set(buf, offset);
    offset += buf.byteLength;
  }
  return output;
}

// src/utils.ts
var joinBuffers = (buffers) => {
  const totalSize = buffers.reduce((acc, buf) => acc + buf.length, 0);
  const output = new Uint8Array(totalSize);
  output.set(buffers[0], 0);
  for (let i = 1; i < buffers.length; i++) {
    output.set(buffers[i], buffers[i - 1].length);
  }
  return output;
};
var textDecoder = new TextDecoder();
var bufToText = (buffer) => {
  return textDecoder.decode(buffer);
};
var URL_PARTS_REGEX = /-(\d{5})-of-(\d{5})\.gguf(?:\?.*)?$/;
var parseShardNumber = (fnameOrUrl) => {
  const matches = fnameOrUrl.match(URL_PARTS_REGEX);
  if (!matches) {
    return {
      baseURL: fnameOrUrl,
      current: 1,
      total: 1
    };
  } else {
    return {
      baseURL: fnameOrUrl.replace(URL_PARTS_REGEX, ""),
      current: parseInt(matches[1]),
      total: parseInt(matches[2])
    };
  }
};
var sortFileByShard = (blobs) => {
  const isFiles = blobs.every((b) => !!b.name);
  if (isFiles && blobs.length > 1) {
    const files = blobs;
    files.sort((a, b) => {
      const infoA = parseShardNumber(a.name);
      const infoB = parseShardNumber(b.name);
      return infoA.current - infoB.current;
    });
  }
};
var absoluteUrl = (relativePath) => new URL(relativePath, document.baseURI).href;
var sumArr = (arr) => arr.reduce((prev, curr) => prev + curr, 0);
var isString = (value) => !!(value == null ? void 0 : value.startsWith);
var isSupportMultiThread = () => ((e) => __async(void 0, null, function* () {
  try {
    return "undefined" != typeof MessageChannel && new MessageChannel().port1.postMessage(new SharedArrayBuffer(1)), WebAssembly.validate(e);
  } catch (e2) {
    return false;
  }
}))(
  new Uint8Array([
    0,
    97,
    115,
    109,
    1,
    0,
    0,
    0,
    1,
    4,
    1,
    96,
    0,
    0,
    3,
    2,
    1,
    0,
    5,
    4,
    1,
    3,
    1,
    1,
    10,
    11,
    1,
    9,
    0,
    65,
    0,
    254,
    16,
    2,
    0,
    26,
    11
  ])
);
var isSupportExceptions = () => __async(void 0, null, function* () {
  return WebAssembly.validate(
    new Uint8Array([
      0,
      97,
      115,
      109,
      1,
      0,
      0,
      0,
      1,
      4,
      1,
      96,
      0,
      0,
      3,
      2,
      1,
      0,
      10,
      8,
      1,
      6,
      0,
      6,
      64,
      25,
      11,
      11
    ])
  );
});
var isSupportSIMD = () => __async(void 0, null, function* () {
  return WebAssembly.validate(
    new Uint8Array([
      0,
      97,
      115,
      109,
      1,
      0,
      0,
      0,
      1,
      5,
      1,
      96,
      0,
      1,
      123,
      3,
      2,
      1,
      0,
      10,
      10,
      1,
      8,
      0,
      65,
      0,
      253,
      15,
      253,
      98,
      11
    ])
  );
});
var checkEnvironmentCompatible = () => __async(void 0, null, function* () {
  if (!(yield isSupportExceptions())) {
    throw new Error("WebAssembly runtime does not support exception handling");
  }
  if (!(yield isSupportSIMD())) {
    throw new Error("WebAssembly runtime does not support SIMD");
  }
});
var GGUF_FILE_REGEX = /^.*\.gguf(?:\?.*)?$/;
var isValidGgufFile = (path) => {
  return GGUF_FILE_REGEX.test(path);
};
var isSafariMobile = () => {
  return !!navigator.userAgent.match(/Version\/([0-9\._]+).*Mobile.*Safari.*/);
};
var createWorker = (workerCode) => {
  const workerURL = URL.createObjectURL(
    isString(workerCode) ? new Blob([workerCode], { type: "text/javascript" }) : workerCode
  );
  return new Worker(workerURL, { type: "module" });
};
var cbToAsyncIter = (fn) => (...args) => {
  let values = [];
  let resolve;
  values.push(
    new Promise((r) => {
      resolve = r;
    })
  );
  fn(...args, (val, done) => {
    resolve([val, done]);
    values.push(
      new Promise((r) => {
        resolve = r;
      })
    );
  });
  return function() {
    return __asyncGenerator(this, null, function* () {
      let val;
      for (let i = 0, done = false; !done; i++) {
        [val, done] = yield new __await(values[i]);
        delete values[i];
        if (val !== void 0) yield val;
      }
    });
  }();
};

// src/workers-code/generated.ts
var LIBLLAMA_VERSION = "b1-4abef75";
var LLAMA_CPP_WORKER_CODE = "// Start the main llama.cpp\nlet wllamaMalloc;\nlet wllamaStart;\nlet wllamaAction;\nlet wllamaExit;\nlet wllamaDebug;\n\nlet Module = null;\n\n// Memory64 WASM builds use i64 (BigInt) for pointer/size_t at the JS boundary.\n// These helpers centralise the Number\u2194BigInt conversion so the rest of the\n// worker code can stay type-agnostic.\nconst _isMem64 = /mem64/.test(String(RUN_OPTIONS?.pathConfig?.['wllama.wasm'] || ''));\nconst _toWasmAddr = _isMem64 ? (n) => BigInt(n) : (n) => n;\nconst _fromWasmAddr = (p) => (typeof p === 'bigint') ? Number(p) : p;\n\nself.onunhandledrejection = (event) => {\n  const reason = event.reason;\n  const detail = reason instanceof Error\n    ? `${reason.name}: ${reason.message}\\n${reason.stack || ''}`\n    : String(reason);\n  msg({ verb: 'console.error', args: [`wllama-inner-unhandledrejection: ${detail}`] });\n};\n\nself.onerror = (message, source, lineno, colno, error) => {\n  const detail = error instanceof Error\n    ? `${error.name}: ${error.message}\\n${error.stack || ''}`\n    : String(message);\n  msg({ verb: 'console.error', args: [`wllama-inner-error: ${detail} at ${source || '(unknown)'}:${lineno || 0}:${colno || 0}`] });\n};\n\n//////////////////////////////////////////////////////////////\n// UTILS\n//////////////////////////////////////////////////////////////\n\n// send message back to main thread\nconst msg = (data, transfer) => postMessage(data, transfer);\n\n// Convert CPP log into JS log\nconst cppLogToJSLog = (line) => {\n  const matched = line.match(/@@(DEBUG|INFO|WARN|ERROR)@@(.*)/);\n  return !!matched\n    ? {\n        level: (matched[1] === 'INFO' ? 'debug' : matched[1]).toLowerCase(),\n        text: matched[2],\n      }\n    : { level: 'log', text: line };\n};\n\n// Get module config that forwards stdout/err to main thread\nconst getWModuleConfig = (_argMainScriptBlob) => {\n  var pathConfig = RUN_OPTIONS.pathConfig;\n  var pthreadPoolSize = RUN_OPTIONS.nbThread;\n  var argMainScriptBlob = _argMainScriptBlob;\n\n  if (!pathConfig['wllama.wasm']) {\n    throw new Error('\"wllama.wasm\" is missing in pathConfig');\n  }\n  return {\n    noInitialRun: true,\n    print: function (text) {\n      if (arguments.length > 1)\n        text = Array.prototype.slice.call(arguments).join(' ');\n      msg({ verb: 'console.log', args: [text] });\n    },\n    printErr: function (text) {\n      if (arguments.length > 1)\n        text = Array.prototype.slice.call(arguments).join(' ');\n      const logLine = cppLogToJSLog(text);\n      msg({ verb: 'console.' + logLine.level, args: [logLine.text] });\n    },\n    locateFile: function (filename, basePath) {\n      const p = pathConfig[filename];\n      const truncate = (str) =>\n        str.length > 128 ? `${str.substr(0, 128)}...` : str;\n      if (filename.match(/wllama\\.worker\\.js/)) {\n        msg({\n          verb: 'console.error',\n          args: [\n            '\"wllama.worker.js\" is removed from v2.2.1. Hint: make sure to clear browser\\'s cache.',\n          ],\n        });\n      } else {\n        msg({\n          verb: 'console.debug',\n          args: [`Loading \"${filename}\" from \"${truncate(p)}\"`],\n        });\n        return p;\n      }\n    },\n    mainScriptUrlOrBlob: argMainScriptBlob,\n    pthreadPoolSize,\n    wasmMemory: pthreadPoolSize > 1 ? getWasmMemory() : null,\n    onAbort: function (text) {\n      msg({ verb: 'signal.abort', args: [text] });\n    },\n  };\n};\n\n// Get the memory to be used by wasm. (Only used in multi-thread mode)\n// Returns null for Memory64 builds \u2014 the Emscripten Memory64 glue creates\n// the correct i64-indexed shared memory itself (address:\"i64\" + BigInt pages).\n// For compat (wasm32) builds, pre-allocate and cap at 32768 pages (2GiB) to fix\n// a LinkError: the compat glue defaults to maximum:65536 (4GiB) which exceeds\n// the wasm32 memory import limit.\n// Steps down on failure for iOS OOM.\n// See: https://github.com/emscripten-core/emscripten/issues/19144\n//      https://github.com/godotengine/godot/issues/70621\nconst getWasmMemory = () => {\n  const wasmPath = String((RUN_OPTIONS.pathConfig || {})['wllama.wasm'] || '');\n  const isCompat = /-compat(\\.wasm|[?#]|$)/.test(wasmPath);\n\n  if (!isCompat) {\n    // Memory64 builds: return null so the Emscripten glue handles memory creation.\n    // Providing an external i32 memory here causes LinkError: cannot import i32 memory as i64.\n    return null;\n  }\n\n  // compat (wasm32) builds: provide i32 shared memory capped at 32768 pages (2GiB).\n  const PAGE_SIZE = 65536;\n  const minBytes = 128 * 1024 * 1024;\n  const maxStart = 2 * 1024 * 1024 * 1024;  // 2GiB = 32768 pages (wasm32 hard limit)\n  const stepBytes = 128 * 1024 * 1024;\n\n  let maxBytes = maxStart;\n  while (maxBytes >= minBytes) {\n    try {\n      return new WebAssembly.Memory({\n        initial: minBytes / PAGE_SIZE,\n        maximum: maxBytes / PAGE_SIZE,\n        shared: true,\n      });\n    } catch (e) {\n      maxBytes -= stepBytes;\n      continue; // retry\n    }\n  }\n  throw new Error('Cannot allocate WebAssembly.Memory for compat multi-thread build');\n};\n\n//////////////////////////////////////////////////////////////\n// MEMFS PATCH\n//////////////////////////////////////////////////////////////\n\n/**\n * By default, emscripten uses memfs. The way it works is by\n * allocating new Uint8Array in javascript heap. This is not good\n * because it requires files to be copied to wasm heap each time\n * a file is read.\n *\n * HeapFS is an alternative, which resolves this problem by\n * allocating space for file directly inside wasm heap. This\n * allows us to mmap without doing any copy.\n *\n * For llama.cpp, this is great because we use MAP_SHARED\n *\n * Ref: https://github.com/ngxson/wllama/pull/39\n * Ref: https://github.com/emscripten-core/emscripten/blob/main/src/library_memfs.js\n *\n * Note 29/05/2024 @ngxson\n * Due to ftell() being limited to MAX_LONG, we cannot load files bigger than 2^31 bytes (or 2GB)\n * Ref: https://github.com/emscripten-core/emscripten/blob/main/system/lib/libc/musl/src/stdio/ftell.c\n */\n\nconst fsNameToFile = {}; // map Name => File\nconst fsIdToFile = {}; // map ID => File\nlet currFileId = 0;\n\n//////////////////////////////////////////////////////////////\n// OPFS DIRECT STATE\n//////////////////////////////////////////////////////////////\n\n/** map memfsName \u2192 { handle: FileSystemSyncAccessHandle, size: number } */\nconst opfsHandles = {};\nlet opfsReadCount = 0;\nlet opfsBytesRead = 0;\n\n/** Close all OPFS SyncAccessHandles (safe to call multiple times). */\nconst closeAllOpfsHandles = () => {\n  for (const name of Object.keys(opfsHandles)) {\n    try { opfsHandles[name].handle.close(); } catch {}\n    delete opfsHandles[name];\n  }\n};\n\n// Patch and redirect memfs calls to wllama\nconst patchMEMFS = () => {\n  const m = Module;\n  // save functions\n  m.MEMFS.stream_ops._read = m.MEMFS.stream_ops.read;\n  m.MEMFS.stream_ops._write = m.MEMFS.stream_ops.write;\n  m.MEMFS.stream_ops._llseek = m.MEMFS.stream_ops.llseek;\n  m.MEMFS.stream_ops._allocate = m.MEMFS.stream_ops.allocate;\n  m.MEMFS.stream_ops._mmap = m.MEMFS.stream_ops.mmap;\n  m.MEMFS.stream_ops._msync = m.MEMFS.stream_ops.msync;\n\n  const patchStream = (stream) => {\n    const name = stream.node.name;\n    if (fsNameToFile[name]) {\n      const f = fsNameToFile[name];\n      stream.node.contents = m.HEAPU8.subarray(f.ptr, f.ptr + f.size);\n      stream.node.usedBytes = f.size;\n    }\n  };\n\n  // replace \"read\" functions \u2014 OPFS direct handles take priority\n  m.MEMFS.stream_ops.read = function (\n    stream,\n    buffer,\n    offset,\n    length,\n    position\n  ) {\n    const name = stream.node.name;\n    if (opfsHandles[name]) {\n      const { handle, size } = opfsHandles[name];\n      if (position >= size) return 0;\n      const readLen = Math.min(size - position, length);\n      const view = new Uint8Array(buffer.buffer, buffer.byteOffset + offset, readLen);\n      const bytesRead = handle.read(view, { at: position });\n      opfsReadCount++;\n      opfsBytesRead += bytesRead;\n      return bytesRead;\n    }\n    patchStream(stream);\n    return m.MEMFS.stream_ops._read(stream, buffer, offset, length, position);\n  };\n  m.MEMFS.ops_table.file.stream.read = m.MEMFS.stream_ops.read;\n\n  // replace \"llseek\" functions\n  m.MEMFS.stream_ops.llseek = function (stream, offset, whence) {\n    if (!opfsHandles[stream.node.name]) patchStream(stream);\n    return m.MEMFS.stream_ops._llseek(stream, offset, whence);\n  };\n  m.MEMFS.ops_table.file.stream.llseek = m.MEMFS.stream_ops.llseek;\n\n  // replace \"mmap\" functions\n  m.MEMFS.stream_ops.mmap = function (stream, length, position, prot, flags) {\n    const name = stream.node.name;\n    if (opfsHandles[name]) {\n      // use_mmap: false should prevent llama.cpp from calling mmap on OPFS files.\n      msg({ verb: 'console.error', args: ['[opfs-direct] OPFS file hit mmap \u2014 use_mmap:false not propagated?', name] });\n      throw new Error('mmap not supported for OPFS-direct files (use use_mmap: false)');\n    }\n    patchStream(stream);\n    if (fsNameToFile[name]) {\n      const f = fsNameToFile[name];\n      return {\n        ptr: f.ptr + position,\n        allocated: false,\n      };\n    } else {\n      return m.MEMFS.stream_ops._mmap(stream, length, position, prot, flags);\n    }\n  };\n  m.MEMFS.ops_table.file.stream.mmap = m.MEMFS.stream_ops.mmap;\n\n  // mount FS\n  m.FS.mkdir('/models');\n  m.FS.mount(m.MEMFS, { root: '.' }, '/models');\n};\n\n// Allocate a new file in wllama heapfs, returns file ID\nconst heapfsAlloc = (name, size) => {\n  if (size < 1) {\n    throw new Error('File size must be bigger than 0');\n  }\n  const m = Module;\n  // mmapAlloc(size) \u2192 _emscripten_builtin_memalign(65536, size).  For mem64\n  // both the alignment and size arguments are i64; alignMemory() inside\n  // mmapAlloc is pure JS math so it accepts Number, but the downstream WASM\n  // call needs BigInt.  We bypass the JS wrapper and call the WASM directly.\n  let ptr;\n  if (_isMem64) {\n    const aligned = Math.ceil(size / 65536) * 65536;\n    ptr = _fromWasmAddr(m._emscripten_builtin_memalign(_toWasmAddr(65536), _toWasmAddr(aligned)));\n    if (ptr) m.HEAPU8.fill(0, ptr, ptr + aligned);\n  } else {\n    ptr = m.mmapAlloc(size);\n  }\n  const file = {\n    ptr: ptr,\n    size: size,\n    id: currFileId++,\n  };\n  fsIdToFile[file.id] = file;\n  fsNameToFile[name] = file;\n  return file.id;\n};\n\n// Add new file to wllama heapfs, return number of written bytes\nconst heapfsWrite = (id, buffer, offset) => {\n  const m = Module;\n  if (fsIdToFile[id]) {\n    const { ptr, size } = fsIdToFile[id];\n    const afterWriteByte = offset + buffer.byteLength;\n    if (afterWriteByte > size) {\n      throw new Error(\n        `File ID ${id} write out of bound, afterWriteByte = ${afterWriteByte} while size = ${size}`\n      );\n    }\n    m.HEAPU8.set(buffer, ptr + offset);\n    return buffer.byteLength;\n  } else {\n    throw new Error(`File ID ${id} not found in heapfs`);\n  }\n};\n\n//////////////////////////////////////////////////////////////\n// MAIN CODE\n//////////////////////////////////////////////////////////////\n\nconst unwrapPtr = async (value) => {\n  const resolved = await value;\n  if (typeof resolved === 'bigint') {\n    return Number(resolved);\n  }\n  return resolved;\n};\n\nconst ptrToString = async (value) => {\n  const ptr = await unwrapPtr(value);\n  return ptr ? Module.UTF8ToString(ptr) : null;\n};\n\nconst actionToHeap = (action) => {\n  const stack = Module.stackSave();\n  const bytes = new TextEncoder().encode(action);\n  // stackAlloc takes i64 size in mem64 and returns an i64 address; convert\n  // to Number before using as a HEAPU8 byte index.\n  const actionPtr = _fromWasmAddr(Module.stackAlloc(_toWasmAddr(bytes.byteLength + 1)));\n  Module.HEAPU8.set(bytes, actionPtr);\n  Module.HEAPU8[actionPtr + bytes.byteLength] = 0;\n  return {\n    actionPtr,\n    restore: () => Module.stackRestore(stack),\n  };\n};\n\nonmessage = async (e) => {\n  if (!e.data) return;\n  const { verb, args, callbackId } = e.data;\n\n  if (!callbackId) {\n    msg({ verb: 'console.error', args: ['callbackId is required', e.data] });\n    return;\n  }\n\n  if (verb === 'module.init') {\n    const argMainScriptBlob = args[0];\n    try {\n      msg({ verb: 'console.debug', args: ['wllama-file-stage:inner-module-init-received'] });\n      Module = getWModuleConfig(argMainScriptBlob);\n      msg({ verb: 'console.debug', args: ['wllama-file-stage:inner-module-config-ready'] });\n      Module.onRuntimeInitialized = async () => {\n        msg({ verb: 'console.debug', args: ['wllama-file-stage:inner-runtime-initialized'] });\n        // init FS\n        patchMEMFS();\n        msg({ verb: 'console.debug', args: ['wllama-file-stage:inner-memfs-patched'] });\n        // init cwrap \u2014 direct Module._wllama_* calls (CPU builds; JSPI adapter in PR2)\n        // _wllama_malloc / _wllama_action take pointer/size_t arguments.\n        // In mem64 builds those are i64 (BigInt) at the JS\u2194WASM boundary.\n        //\n        // Asyncify builds: Module._wllama_* are synchronous wrappers that trigger\n        // the Asyncify unwind/rewind cycle internally. After calling the export, the\n        // actual return value is obtained via Module['Asyncify'].whenDone() which\n        // resolves when the WASM function truly completes (after all async imports\n        // like emwgpuWaitAny have been awaited and the stack has been rewound).\n        const _isAsyncify = typeof Module['Asyncify'] !== 'undefined'\n          && typeof Module['Asyncify'].whenDone === 'function';\n        // Asyncify: after calling a WASM export, check currData to determine if the\n        // function suspended for an async operation. If currData is non-null, the WASM\n        // is waiting on an async import (e.g. emwgpuWaitAny); use whenDone() to await\n        // the result. If currData is null, the function completed synchronously; return\n        // the synchronous return value directly.\n        const _callWasm = _isAsyncify\n          ? async (fn, ...args) => {\n              const syncResult = fn(...args);\n              if (Module['Asyncify'].currData !== null) {\n                return Module['Asyncify'].whenDone();\n              }\n              return syncResult;\n            }\n          : async (fn, ...args) => fn(...args);\n        wllamaMalloc = async (size, dummy) =>\n          _fromWasmAddr(await _callWasm(Module._wllama_malloc, _toWasmAddr(size), dummy));\n        wllamaStart = async () => await ptrToString(await _callWasm(Module._wllama_start));\n        wllamaAction = async (action, reqPtr) => {\n          const { actionPtr, restore } = actionToHeap(action);\n          try {\n            return _fromWasmAddr(\n              await _callWasm(Module._wllama_action, _toWasmAddr(actionPtr), _toWasmAddr(reqPtr))\n            );\n          } finally {\n            restore();\n          }\n        };\n        wllamaExit = async () => await ptrToString(await _callWasm(Module._wllama_exit));\n        wllamaDebug = async () => await ptrToString(await _callWasm(Module._wllama_debug));\n        msg({ verb: 'console.debug', args: ['wllama-file-stage:inner-cwrap-ready'] });\n        // Pre-warm pthread Workers so they finish loading their WASM module before the\n        // first ggml_barrier call during decode. Without this, lazily-spawned Workers\n        // may still be loading when the main thread reaches the barrier \u2192 deadlock.\n        if (typeof Module['__pthreadPrewarm'] === 'function') {\n          msg({ verb: 'console.debug', args: ['wllama-file-stage:inner-pthread-prewarm-start'] });\n          await Module['__pthreadPrewarm']();\n          msg({ verb: 'console.debug', args: ['wllama-file-stage:inner-pthread-prewarm-done'] });\n        }\n        msg({ callbackId, result: null });\n      };\n      msg({ verb: 'console.debug', args: ['wllama-file-stage:inner-wmodule-init-begin'] });\n      wModuleInit();\n      msg({ verb: 'console.debug', args: ['wllama-file-stage:inner-wmodule-init-returned'] });\n    } catch (err) {\n      msg({ callbackId, err });\n    }\n    return;\n  }\n\n  if (verb === 'fs.opfs-setup') {\n    // Set up OPFS SyncAccessHandles for OPFS-direct model loading.\n    // shards: Array<{ memfsName: string; opfsFilename: string }>\n    const modelId = args[0];\n    const shards = args[1];\n    try {\n      const root = await navigator.storage.getDirectory();\n      const modelsDir = await root.getDirectoryHandle('models');\n      const modelDir = await modelsDir.getDirectoryHandle(modelId);\n      for (const shard of shards) {\n        const fh = await modelDir.getFileHandle(shard.opfsFilename);\n        const handle = await fh.createSyncAccessHandle();\n        const size = handle.getSize();\n        Module['FS_createDataFile'](\n          '/models',\n          shard.memfsName,\n          new ArrayBuffer(0),\n          true,\n          true,\n          true\n        );\n        const node = Module.FS.lookupPath('/models/' + shard.memfsName).node;\n        node.usedBytes = size;\n        opfsHandles[shard.memfsName] = { handle, size };\n      }\n      msg({ callbackId, result: { ok: true, shardCount: shards.length } });\n    } catch (err) {\n      closeAllOpfsHandles();\n      msg({ callbackId, err });\n    }\n    return;\n  }\n\n  if (verb === 'fs.opfs-cleanup') {\n    try {\n      closeAllOpfsHandles();\n      msg({ callbackId, result: { ok: true } });\n    } catch (err) {\n      msg({ callbackId, err });\n    }\n    return;\n  }\n\n  if (verb === 'fs.opfs-stats') {\n    try {\n      msg({ callbackId, result: { opfsReadCount, opfsBytesRead } });\n    } catch (err) {\n      msg({ callbackId, err });\n    }\n    return;\n  }\n\n  if (verb === 'fs.alloc') {\n    const argFilename = args[0];\n    const argSize = args[1];\n    try {\n      // create blank file\n      const emptyBuffer = new ArrayBuffer(0);\n      Module['FS_createDataFile'](\n        '/models',\n        argFilename,\n        emptyBuffer,\n        true,\n        true,\n        true\n      );\n      // alloc data on heap\n      const fileId = heapfsAlloc(argFilename, argSize);\n      msg({ callbackId, result: { fileId } });\n    } catch (err) {\n      msg({ callbackId, err });\n    }\n    return;\n  }\n\n  if (verb === 'fs.write') {\n    const argFileId = args[0];\n    const argBuffer = args[1];\n    const argOffset = args[2];\n    try {\n      const writtenBytes = heapfsWrite(argFileId, argBuffer, argOffset);\n      msg({ callbackId, result: { writtenBytes } });\n    } catch (err) {\n      msg({ callbackId, err });\n    }\n    return;\n  }\n\n  if (verb === 'wllama.start') {\n    try {\n      const result = await wllamaStart();\n      msg({ callbackId, result });\n    } catch (err) {\n      msg({ callbackId, err });\n    }\n    return;\n  }\n\n  if (verb === 'wllama.action') {\n    const argAction = args[0];\n    const argEncodedMsg = args[1];\n    try {\n      const inputPtr = await wllamaMalloc(argEncodedMsg.byteLength, 0);\n      // copy data to wasm heap\n      const inputBuffer = new Uint8Array(\n        Module.HEAPU8.buffer,\n        inputPtr,\n        argEncodedMsg.byteLength\n      );\n      inputBuffer.set(argEncodedMsg, 0);\n      const outputPtr = await wllamaAction(argAction, inputPtr);\n      // length of output buffer is written at the first 4 bytes of input buffer\n      const outputLen = new Uint32Array(Module.HEAPU8.buffer, inputPtr, 1)[0];\n      if (!outputPtr) {\n        throw new Error(\n          `wllama_action returned null for action=\"${argAction}\" (outputLen=${outputLen})`\n        );\n      }\n      // copy the output buffer to JS heap\n      const outputBuffer = new Uint8Array(outputLen);\n      const outputSrcView = new Uint8Array(\n        Module.HEAPU8.buffer,\n        outputPtr,\n        outputLen\n      );\n      outputBuffer.set(outputSrcView, 0); // copy it\n      msg({ callbackId, result: outputBuffer }, [outputBuffer.buffer]);\n    } catch (err) {\n      msg({ callbackId, err });\n    }\n    return;\n  }\n\n  if (verb === 'wllama.exit') {\n    try {\n      const result = await wllamaExit();\n      msg({ callbackId, result });\n    } catch (err) {\n      msg({ callbackId, err });\n    }\n    return;\n  }\n\n  if (verb === 'wllama.debug') {\n    try {\n      const result = await wllamaDebug();\n      msg({ callbackId, result });\n    } catch (err) {\n      msg({ callbackId, err });\n    }\n    return;\n  }\n};\n";
var OPFS_UTILS_WORKER_CODE = "let accessHandle;\nlet abortController = new AbortController();\n\nasync function openFile(filename) {\n  const opfsRoot = await navigator.storage.getDirectory();\n  const cacheDir = await opfsRoot.getDirectoryHandle('cache', { create: true });\n  const fileHandler = await cacheDir.getFileHandle(filename, { create: true });\n  accessHandle = await fileHandler.createSyncAccessHandle();\n  accessHandle.truncate(0); // clear file content\n}\n\nasync function writeFile(buf) {\n  accessHandle.write(buf);\n}\n\nasync function closeFile() {\n  accessHandle.flush();\n  accessHandle.close();\n}\n\nasync function writeTextFile(filename, str) {\n  await openFile(filename);\n  await writeFile(new TextEncoder().encode(str));\n  await closeFile();\n}\n\nconst throttled = (func, delay) => {\n  let lastRun = 0;\n  return (...args) => {\n    const now = Date.now();\n    if (now - lastRun > delay) {\n      lastRun = now;\n      func.apply(null, args);\n    }\n  };\n};\n\nconst assertNonNull = (val) => {\n  if (val === null || val === undefined) {\n    throw new Error('OPFS Worker: Assertion failed');\n  }\n};\n\n// respond to main thread\nconst resOK = () => postMessage({ ok: true });\nconst resProgress = (loaded, total) =>\n  postMessage({ progress: { loaded, total } });\nconst resErr = (err) => postMessage({ err });\n\nonmessage = async (e) => {\n  try {\n    if (!e.data) return;\n\n    /**\n     * @param {Object} e.data\n     *\n     * Fine-control FS actions:\n     * - { action: 'open', filename: 'string' }\n     * - { action: 'write', buf: ArrayBuffer }\n     * - { action: 'close' }\n     *\n     * Simple write API:\n     * - { action: 'write-simple', filename: 'string', buf: ArrayBuffer }\n     *\n     * Download API:\n     * - { action: 'download', url: 'string', filename: 'string', options: Object, metadataFileName: 'string' }\n     * - { action: 'download-abort' }\n     */\n    const { action, filename, buf, url, options, metadataFileName } = e.data;\n\n    if (action === 'open') {\n      assertNonNull(filename);\n      await openFile(filename);\n      return resOK();\n    } else if (action === 'write') {\n      assertNonNull(buf);\n      await writeFile(buf);\n      return resOK();\n    } else if (action === 'close') {\n      await closeFile();\n      return resOK();\n    } else if (action === 'write-simple') {\n      assertNonNull(filename);\n      assertNonNull(buf);\n      await openFile(filename);\n      await writeFile(buf);\n      await closeFile();\n      return resOK();\n    } else if (action === 'download') {\n      assertNonNull(url);\n      assertNonNull(filename);\n      assertNonNull(metadataFileName);\n      assertNonNull(options);\n      assertNonNull(options.aborted);\n      abortController = new AbortController();\n      if (options.aborted) abortController.abort();\n      const response = await fetch(url, {\n        ...options,\n        signal: abortController.signal,\n      });\n      const contentLength = response.headers.get('content-length');\n      const etag = (response.headers.get('etag') || '').replace(\n        /[^A-Za-z0-9]/g,\n        ''\n      );\n      const total = parseInt(contentLength, 10);\n      const reader = response.body.getReader();\n      await openFile(filename);\n      let loaded = 0;\n      const throttledProgress = throttled(resProgress, 100);\n      while (true) {\n        const { done, value } = await reader.read();\n        if (done) break;\n        loaded += value.byteLength;\n        await writeFile(value);\n        throttledProgress(loaded, total);\n      }\n      resProgress(total, total); // 100% done\n      await closeFile();\n      // make sure this is in-sync with CacheEntryMetadata\n      await writeTextFile(\n        metadataFileName,\n        JSON.stringify({\n          originalURL: url,\n          originalSize: total,\n          etag,\n        })\n      );\n      return resOK();\n    } else if (action === 'download-abort') {\n      if (abortController) {\n        abortController.abort();\n      }\n      return;\n    }\n\n    throw new Error('OPFS Worker: Invalid action', e.data);\n  } catch (err) {\n    return resErr(err);\n  }\n};\n";
var WLLAMA_MULTI_THREAD_CODE = '(function(){function humanReadableVersionToPacked(str){str=str.split("-")[0];var vers=str.split(".").slice(0,3);while(vers.length<3)vers.push("00");vers=vers.map((n,i,arr)=>n.padStart(2,"0"));return vers.join("")}var packedVersionToHumanReadable=n=>[n/1e4|0,(n/100|0)%100,n%100].join(".");var TARGET_NOT_SUPPORTED=2147483647;var currentNodeVersion=typeof process!=="undefined"&&process.versions?.node?humanReadableVersionToPacked(process.versions.node):TARGET_NOT_SUPPORTED;if(currentNodeVersion<160400){throw new Error(`This emscripten-generated code requires node v${packedVersionToHumanReadable(160400)} (detected v${packedVersionToHumanReadable(currentNodeVersion)})`)}var userAgent=typeof navigator!=="undefined"&&navigator.userAgent;if(!userAgent){return}var currentSafariVersion=userAgent.includes("Safari/")&&!userAgent.includes("Chrome/")&&userAgent.match(/Version\\/(\\d+\\.?\\d*\\.?\\d*)/)?humanReadableVersionToPacked(userAgent.match(/Version\\/(\\d+\\.?\\d*\\.?\\d*)/)[1]):TARGET_NOT_SUPPORTED;if(currentSafariVersion<15e4){throw new Error(`This emscripten-generated code requires Safari v${packedVersionToHumanReadable(15e4)} (detected v${currentSafariVersion})`)}var currentFirefoxVersion=userAgent.match(/Firefox\\/(\\d+(?:\\.\\d+)?)/)?parseFloat(userAgent.match(/Firefox\\/(\\d+(?:\\.\\d+)?)/)[1]):TARGET_NOT_SUPPORTED;if(currentFirefoxVersion<79){throw new Error(`This emscripten-generated code requires Firefox v79 (detected v${currentFirefoxVersion})`)}var currentChromeVersion=userAgent.match(/Chrome\\/(\\d+(?:\\.\\d+)?)/)?parseFloat(userAgent.match(/Chrome\\/(\\d+(?:\\.\\d+)?)/)[1]):TARGET_NOT_SUPPORTED;if(currentChromeVersion<85){throw new Error(`This emscripten-generated code requires Chrome v85 (detected v${currentChromeVersion})`)}})();var Module=typeof Module!="undefined"?Module:{};var ENVIRONMENT_IS_WEB=!!globalThis.window;var ENVIRONMENT_IS_WORKER=!!globalThis.WorkerGlobalScope;var ENVIRONMENT_IS_NODE=globalThis.process?.versions?.node&&globalThis.process?.type!="renderer";var ENVIRONMENT_IS_SHELL=!ENVIRONMENT_IS_WEB&&!ENVIRONMENT_IS_NODE&&!ENVIRONMENT_IS_WORKER;var ENVIRONMENT_IS_PTHREAD=ENVIRONMENT_IS_WORKER&&globalThis.name?.startsWith("em-pthread");if(ENVIRONMENT_IS_NODE){var worker_threads=require("node:worker_threads");global.Worker=worker_threads.Worker;ENVIRONMENT_IS_WORKER=!worker_threads.isMainThread;ENVIRONMENT_IS_PTHREAD=ENVIRONMENT_IS_WORKER&&worker_threads.workerData=="em-pthread"}var arguments_=[];var thisProgram="./this.program";var quit_=(status,toThrow)=>{throw toThrow};var _scriptName=globalThis.document?.currentScript?.src;if(typeof __filename!="undefined"){_scriptName=__filename}else if(ENVIRONMENT_IS_WORKER){_scriptName=self.location.href}var scriptDirectory="";function locateFile(path){if(Module["locateFile"]){return Module["locateFile"](path,scriptDirectory)}return scriptDirectory+path}var readAsync,readBinary;if(ENVIRONMENT_IS_NODE){const isNode=globalThis.process?.versions?.node&&globalThis.process?.type!="renderer";if(!isNode)throw new Error("not compiled for this environment (did you build to HTML and try to run it not on the web, or set ENVIRONMENT to something - like node - and run it someplace else - like on the web?)");var fs=require("node:fs");scriptDirectory=__dirname+"/";readBinary=filename=>{filename=isFileURI(filename)?new URL(filename):filename;var ret=fs.readFileSync(filename);assert(Buffer.isBuffer(ret));return ret};readAsync=async(filename,binary=true)=>{filename=isFileURI(filename)?new URL(filename):filename;var ret=fs.readFileSync(filename,binary?undefined:"utf8");assert(binary?Buffer.isBuffer(ret):typeof ret=="string");return ret};if(process.argv.length>1){thisProgram=process.argv[1].replace(/\\\\/g,"/")}arguments_=process.argv.slice(2);if(typeof module!="undefined"){module["exports"]=Module}quit_=(status,toThrow)=>{process.exitCode=status;throw toThrow}}else if(ENVIRONMENT_IS_SHELL){}else if(ENVIRONMENT_IS_WEB||ENVIRONMENT_IS_WORKER){try{scriptDirectory=new URL(".",_scriptName).href}catch{}if(!(globalThis.window||globalThis.WorkerGlobalScope))throw new Error("not compiled for this environment (did you build to HTML and try to run it not on the web, or set ENVIRONMENT to something - like node - and run it someplace else - like on the web?)");if(!ENVIRONMENT_IS_NODE){if(ENVIRONMENT_IS_WORKER){readBinary=url=>{var xhr=new XMLHttpRequest;xhr.open("GET",url,false);xhr.responseType="arraybuffer";xhr.send(null);return new Uint8Array(xhr.response)}}readAsync=async url=>{if(isFileURI(url)){return new Promise((resolve,reject)=>{var xhr=new XMLHttpRequest;xhr.open("GET",url,true);xhr.responseType="arraybuffer";xhr.onload=()=>{if(xhr.status==200||xhr.status==0&&xhr.response){resolve(xhr.response);return}reject(xhr.status)};xhr.onerror=reject;xhr.send(null)})}var response=await fetch(url,{credentials:"same-origin"});if(response.ok){return response.arrayBuffer()}throw new Error(response.status+" : "+response.url)}}}else{throw new Error("environment detection error")}var defaultPrint=console.log.bind(console);var defaultPrintErr=console.error.bind(console);if(ENVIRONMENT_IS_NODE){var utils=require("node:util");var stringify=a=>typeof a=="object"?utils.inspect(a):a;defaultPrint=(...args)=>fs.writeSync(1,args.map(stringify).join(" ")+"\\n");defaultPrintErr=(...args)=>fs.writeSync(2,args.map(stringify).join(" ")+"\\n")}var out=defaultPrint;var err=defaultPrintErr;assert(ENVIRONMENT_IS_WEB||ENVIRONMENT_IS_WORKER||ENVIRONMENT_IS_NODE,"Pthreads do not work in this environment yet (need Web Workers, or an alternative to them)");assert(!ENVIRONMENT_IS_SHELL,"shell environment detected but not enabled at build time.  Add `shell` to `-sENVIRONMENT` to enable.");var wasmBinary;if(!globalThis.WebAssembly){err("no native wasm support detected")}var wasmModule;var ABORT=false;var EXITSTATUS;function assert(condition,text){if(!condition){abort("Assertion failed"+(text?": "+text:""))}}var isFileURI=filename=>filename.startsWith("file://");function writeStackCookie(){var max=_emscripten_stack_get_end();assert((max&3)==0);if(max==0){max+=4}(growMemViews(),HEAPU32)[max>>2]=34821223;(growMemViews(),HEAPU32)[max+4>>2]=2310721022;(growMemViews(),HEAPU32)[0>>2]=1668509029}function checkStackCookie(){if(ABORT)return;var max=_emscripten_stack_get_end();if(max==0){max+=4}var cookie1=(growMemViews(),HEAPU32)[max>>2];var cookie2=(growMemViews(),HEAPU32)[max+4>>2];if(cookie1!=34821223||cookie2!=2310721022){abort(`Stack overflow! Stack cookie has been overwritten at ${ptrToString(max)}, expected hex dwords 0x89BACDFE and 0x2135467, but received ${ptrToString(cookie2)} ${ptrToString(cookie1)}`)}if((growMemViews(),HEAPU32)[0>>2]!=1668509029){abort("Runtime error: The application has corrupted its heap memory area (address zero)!")}}class EmscriptenEH{}class EmscriptenSjLj extends EmscriptenEH{}var runtimeDebug=true;function dbg(...args){if(!runtimeDebug&&typeof runtimeDebug!="undefined")return;if(ENVIRONMENT_IS_NODE){var fs=require("node:fs");var utils=require("node:util");function stringify(a){switch(typeof a){case"object":return utils.inspect(a);case"undefined":return"undefined"}return a}fs.writeSync(2,args.map(stringify).join(" ")+"\\n")}else console.warn(...args)}(()=>{var h16=new Int16Array(1);var h8=new Int8Array(h16.buffer);h16[0]=25459;if(h8[0]!==115||h8[1]!==99)abort("Runtime error: expected the system to be little-endian! (Run with -sSUPPORT_BIG_ENDIAN to bypass)")})();function consumedModuleProp(prop){if(!Object.getOwnPropertyDescriptor(Module,prop)){Object.defineProperty(Module,prop,{configurable:true,set(){abort(`Attempt to set \\`Module.${prop}\\` after it has already been processed.  This can happen, for example, when code is injected via \'--post-js\' rather than \'--pre-js\'`)}})}}function makeInvalidEarlyAccess(name){return()=>assert(false,`call to \'${name}\' via reference taken before Wasm module initialization`)}function ignoredModuleProp(prop){if(Object.getOwnPropertyDescriptor(Module,prop)){abort(`\\`Module.${prop}\\` was supplied but \\`${prop}\\` not included in INCOMING_MODULE_JS_API`)}}function isExportedByForceFilesystem(name){return name==="FS_createPath"||name==="FS_createDataFile"||name==="FS_createPreloadedFile"||name==="FS_preloadFile"||name==="FS_unlink"||name==="addRunDependency"||name==="FS_createLazyFile"||name==="FS_createDevice"||name==="removeRunDependency"}function hookGlobalSymbolAccess(sym,func){if(!Object.getOwnPropertyDescriptor(globalThis,sym)){Object.defineProperty(globalThis,sym,{configurable:true,get(){func();return undefined}})}}function missingGlobal(sym,msg){hookGlobalSymbolAccess(sym,()=>{warnOnce(`\\`${sym}\\` is no longer defined by emscripten. ${msg}`)})}missingGlobal("buffer","Please use HEAP8.buffer or wasmMemory.buffer");missingGlobal("asm","Please use wasmExports instead");function unexportedRuntimeSymbol(sym){if(ENVIRONMENT_IS_PTHREAD){return}if(!Object.getOwnPropertyDescriptor(Module,sym)){Object.defineProperty(Module,sym,{configurable:true,get(){var msg=`\'${sym}\' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the Emscripten FAQ)`;if(isExportedByForceFilesystem(sym)){msg+=". Alternatively, forcing filesystem support (-sFORCE_FILESYSTEM) can export this for you"}abort(msg)}})}}function initWorkerLogging(){function getLogPrefix(){var t=0;if(runtimeInitialized&&typeof _pthread_self!="undefined"){t=_pthread_self()}return`w:${workerID},t:${ptrToString(t)}:`}var origDbg=dbg;dbg=(...args)=>origDbg(getLogPrefix(),...args)}initWorkerLogging();function growMemViews(){if(wasmMemory.buffer!=HEAP8.buffer){updateMemoryViews()}}if(ENVIRONMENT_IS_NODE&&ENVIRONMENT_IS_PTHREAD){globalThis.self=globalThis;var parentPort=worker_threads.parentPort;if(!globalThis.postMessage){parentPort.on("message",msg=>globalThis.onmessage?.({data:msg}));globalThis.postMessage=msg=>parentPort.postMessage(msg)}process.on("uncaughtException",err=>{postMessage({cmd:"uncaughtException",error:err});process.exit(1)})}var workerID=0;var startWorker;if(ENVIRONMENT_IS_PTHREAD){var initializedJS=false;self.onunhandledrejection=e=>{throw e.reason||e};function handleMessage(e){try{var msgData=e["data"];var cmd=msgData.cmd;if(cmd==="load"){workerID=msgData.workerID;let messageQueue=[];self.onmessage=e=>messageQueue.push(e);startWorker=()=>{postMessage({cmd:"loaded"});for(let msg of messageQueue){handleMessage(msg)}self.onmessage=handleMessage};for(const handler of msgData.handlers){if(!Module[handler]||Module[handler].proxy){Module[handler]=(...args)=>{postMessage({cmd:"callHandler",handler,args})};if(handler=="print")out=Module[handler];if(handler=="printErr")err=Module[handler]}}wasmMemory=msgData.wasmMemory;updateMemoryViews();wasmModule=msgData.wasmModule;createWasm();run()}else if(cmd==="run"){assert(msgData.pthread_ptr);establishStackSpace(msgData.pthread_ptr);__emscripten_thread_init(msgData.pthread_ptr,0,0,1,0,0);PThread.threadInitTLS();__emscripten_thread_mailbox_await(msgData.pthread_ptr);if(!initializedJS){initializedJS=true}try{invokeEntryPoint(msgData.start_routine,msgData.arg)}catch(ex){if(ex!="unwind"){throw ex}}}else if(msgData.target==="setimmediate"){}else if(cmd==="checkMailbox"){if(initializedJS){checkMailbox()}}else if(cmd){err(`worker: received unknown command ${cmd}`);err(msgData)}}catch(ex){err(`worker: onmessage() captured an uncaught exception: ${ex}`);if(ex?.stack)err(ex.stack);__emscripten_thread_crashed();throw ex}}self.onmessage=handleMessage}var runtimeInitialized=false;function updateMemoryViews(){var b=wasmMemory.buffer;HEAP8=new Int8Array(b);HEAP16=new Int16Array(b);HEAPU8=new Uint8Array(b);HEAPU16=new Uint16Array(b);HEAP32=new Int32Array(b);HEAPU32=new Uint32Array(b);HEAPF32=new Float32Array(b);HEAPF64=new Float64Array(b);HEAP64=new BigInt64Array(b);HEAPU64=new BigUint64Array(b);Module["HEAP8"]=HEAP8;Module["HEAPU8"]=HEAPU8;Module["HEAP16"]=HEAP16;Module["HEAPU16"]=HEAPU16;Module["HEAP32"]=HEAP32;Module["HEAPU32"]=HEAPU32;Module["HEAPF32"]=HEAPF32;Module["HEAPF64"]=HEAPF64;Module["HEAP64"]=HEAP64;Module["HEAPU64"]=HEAPU64}function initMemory(){if(ENVIRONMENT_IS_PTHREAD){return}if(Module["wasmMemory"]){wasmMemory=Module["wasmMemory"]}else{var INITIAL_MEMORY=Module["INITIAL_MEMORY"]||134217728;assert(INITIAL_MEMORY>=65536,`INITIAL_MEMORY should be larger than STACK_SIZE, was ${INITIAL_MEMORY}! (STACK_SIZE=65536)`);wasmMemory=new WebAssembly.Memory({initial:INITIAL_MEMORY/65536,maximum:32768,shared:true})}updateMemoryViews()}assert(globalThis.Int32Array&&globalThis.Float64Array&&Int32Array.prototype.subarray&&Int32Array.prototype.set,"JS engine does not provide full typed array support");function preRun(){assert(!ENVIRONMENT_IS_PTHREAD);if(Module["preRun"]){if(typeof Module["preRun"]=="function")Module["preRun"]=[Module["preRun"]];while(Module["preRun"].length){addOnPreRun(Module["preRun"].shift())}}consumedModuleProp("preRun");callRuntimeCallbacks(onPreRuns)}function initRuntime(){assert(!runtimeInitialized);runtimeInitialized=true;if(ENVIRONMENT_IS_PTHREAD)return startWorker();checkStackCookie();if(!Module["noFSInit"]&&!FS.initialized)FS.init();TTY.init();wasmExports["__wasm_call_ctors"]();FS.ignorePermissions=false}function preMain(){checkStackCookie()}function postRun(){checkStackCookie();if(ENVIRONMENT_IS_PTHREAD){return}if(Module["postRun"]){if(typeof Module["postRun"]=="function")Module["postRun"]=[Module["postRun"]];while(Module["postRun"].length){addOnPostRun(Module["postRun"].shift())}}consumedModuleProp("postRun");callRuntimeCallbacks(onPostRuns)}function abort(what){Module["onAbort"]?.(what);what=`Aborted(${what})`;err(what);ABORT=true;if(what.search(/RuntimeError: [Uu]nreachable/)>=0){what+=\'. "unreachable" may be due to ASYNCIFY_STACK_SIZE not being large enough (try increasing it)\'}var e=new WebAssembly.RuntimeError(what);throw e}function createExportWrapper(name,nargs){return(...args)=>{assert(runtimeInitialized,`native function \\`${name}\\` called before runtime initialization`);var f=wasmExports[name];assert(f,`exported native function \\`${name}\\` not found`);assert(args.length<=nargs,`native function \\`${name}\\` called with ${args.length} args but expects ${nargs}`);return f(...args)}}var wasmBinaryFile;function findWasmBinary(){return locateFile("wllama.wasm")}function getBinarySync(file){if(file==wasmBinaryFile&&wasmBinary){return new Uint8Array(wasmBinary)}if(readBinary){return readBinary(file)}throw"both async and sync fetching of the wasm failed"}async function getWasmBinary(binaryFile){if(!wasmBinary){try{var response=await readAsync(binaryFile);return new Uint8Array(response)}catch{}}return getBinarySync(binaryFile)}async function instantiateArrayBuffer(binaryFile,imports){try{var binary=await getWasmBinary(binaryFile);var instance=await WebAssembly.instantiate(binary,imports);return instance}catch(reason){err(`failed to asynchronously prepare wasm: ${reason}`);if(isFileURI(binaryFile)){err(`warning: Loading from a file URI (${binaryFile}) is not supported in most browsers. See https://emscripten.org/docs/getting_started/FAQ.html#how-do-i-run-a-local-webserver-for-testing-why-does-my-program-stall-in-downloading-or-preparing`)}abort(reason)}}async function instantiateAsync(binary,binaryFile,imports){if(!binary&&!isFileURI(binaryFile)&&!ENVIRONMENT_IS_NODE){try{var response=fetch(binaryFile,{credentials:"same-origin"});var instantiationResult=await WebAssembly.instantiateStreaming(response,imports);return instantiationResult}catch(reason){err(`wasm streaming compile failed: ${reason}`);err("falling back to ArrayBuffer instantiation")}}return instantiateArrayBuffer(binaryFile,imports)}function getWasmImports(){assignWasmImports();if(!wasmImports.__instrumented){wasmImports.__instrumented=true;Asyncify.instrumentWasmImports(wasmImports)}var imports={env:wasmImports,wasi_snapshot_preview1:wasmImports};return imports}async function createWasm(){function receiveInstance(instance,module){wasmExports=instance.exports;wasmExports=Asyncify.instrumentWasmExports(wasmExports);registerTLSInit(wasmExports["_emscripten_tls_init"]);assignWasmExports(wasmExports);wasmModule=module;removeRunDependency("wasm-instantiate");return wasmExports}addRunDependency("wasm-instantiate");var trueModule=Module;function receiveInstantiationResult(result){assert(Module===trueModule,"the Module object should not be replaced during async compilation - perhaps the order of HTML elements is wrong?");trueModule=null;return receiveInstance(result["instance"],result["module"])}var info=getWasmImports();if(Module["instantiateWasm"]){return new Promise((resolve,reject)=>{try{Module["instantiateWasm"](info,(inst,mod)=>{resolve(receiveInstance(inst,mod))})}catch(e){err(`Module.instantiateWasm callback failed with error: ${e}`);reject(e)}})}if(ENVIRONMENT_IS_PTHREAD){assert(wasmModule,"wasmModule should have been received via postMessage");var instance=new WebAssembly.Instance(wasmModule,getWasmImports());return receiveInstance(instance,wasmModule)}wasmBinaryFile??=findWasmBinary();var result=await instantiateAsync(wasmBinary,wasmBinaryFile,info);var exports=receiveInstantiationResult(result);return exports}class ExitStatus{name="ExitStatus";constructor(status){this.message=`Program terminated with exit(${status})`;this.status=status}}var HEAP16;var HEAP32;var HEAP64;var HEAP8;var HEAPF32;var HEAPF64;var HEAPU16;var HEAPU32;var HEAPU64;var HEAPU8;var terminateWorker=worker=>{worker.terminate();worker.onmessage=e=>{var cmd=e["data"].cmd;err(`received "${cmd}" command from terminated worker: ${worker.workerID}`)}};var cleanupThread=pthread_ptr=>{assert(!ENVIRONMENT_IS_PTHREAD,"Internal Error! cleanupThread() can only ever be called from main application thread!");assert(pthread_ptr,"Internal Error! Null pthread_ptr in cleanupThread!");var worker=PThread.pthreads[pthread_ptr];assert(worker);PThread.returnWorkerToPool(worker)};var callRuntimeCallbacks=callbacks=>{while(callbacks.length>0){callbacks.shift()(Module)}};var onPreRuns=[];var addOnPreRun=cb=>onPreRuns.push(cb);var spawnThread=threadParams=>{assert(!ENVIRONMENT_IS_PTHREAD,"Internal Error! spawnThread() can only ever be called from main application thread!");assert(threadParams.pthread_ptr,"Internal error, no pthread ptr!");var worker=PThread.getNewWorker();if(!worker){return 6}assert(!worker.pthread_ptr,"Internal error!");PThread.runningWorkers.push(worker);PThread.pthreads[threadParams.pthread_ptr]=worker;worker.pthread_ptr=threadParams.pthread_ptr;var msg={cmd:"run",start_routine:threadParams.startRoutine,arg:threadParams.arg,pthread_ptr:threadParams.pthread_ptr};if(ENVIRONMENT_IS_NODE){worker.unref()}worker.postMessage(msg,threadParams.transferList);return 0};var runtimeKeepaliveCounter=0;var keepRuntimeAlive=()=>noExitRuntime||runtimeKeepaliveCounter>0;var stackSave=()=>_emscripten_stack_get_current();var stackRestore=val=>__emscripten_stack_restore(val);var stackAlloc=sz=>__emscripten_stack_alloc(sz);var proxyToMainThread=(funcIndex,emAsmAddr,proxyMode,...callArgs)=>{var bufSize=8*callArgs.length*2;var sp=stackSave();var args=stackAlloc(bufSize);var b=args>>3;for(var arg of callArgs){if(typeof arg=="bigint"){(growMemViews(),HEAP64)[b++]=1n;(growMemViews(),HEAP64)[b++]=arg}else{(growMemViews(),HEAP64)[b++]=0n;(growMemViews(),HEAPF64)[b++]=arg}}var rtn=__emscripten_run_js_on_main_thread(funcIndex,emAsmAddr,bufSize,args,proxyMode);stackRestore(sp);return rtn};function _proc_exit(code){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(0,0,1,code);EXITSTATUS=code;if(!keepRuntimeAlive()){PThread.terminateAllThreads();Module["onExit"]?.(code);ABORT=true}quit_(code,new ExitStatus(code))}function exitOnMainThread(returnCode){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(1,0,0,returnCode);_exit(returnCode)}var exitJS=(status,implicit)=>{EXITSTATUS=status;checkUnflushedContent();if(ENVIRONMENT_IS_PTHREAD){assert(!implicit);exitOnMainThread(status);throw"unwind"}if(keepRuntimeAlive()&&!implicit){var msg=`program exited (with status: ${status}), but keepRuntimeAlive() is set (counter=${runtimeKeepaliveCounter}) due to an async operation, so halting execution but not exiting the runtime or preventing further async execution (you can use emscripten_force_exit, if you want to force a true shutdown)`;err(msg)}_proc_exit(status)};var _exit=exitJS;function ptrToString(ptr){assert(typeof ptr==="number",`ptrToString expects a number, got ${typeof ptr}`);ptr>>>=0;return"0x"+ptr.toString(16).padStart(8,"0")}var PThread={unusedWorkers:[],runningWorkers:[],tlsInitFunctions:[],pthreads:{},nextWorkerID:1,init(){if(!ENVIRONMENT_IS_PTHREAD){PThread.initMainThread()}},initMainThread(){Module["__pthreadPrewarm"]=function(){var n=typeof Module["pthreadPoolSize"]==="number"?Module["pthreadPoolSize"]-1:0;if(n<=0)return Promise.resolve();var ps=[];for(var i=0;i<n;i++){PThread.allocateUnusedWorker();var w=PThread.unusedWorkers[PThread.unusedWorkers.length-1];ps.push(PThread.loadWasmModuleToWorker(w));}return Promise.all(ps);};},terminateAllThreads:()=>{assert(!ENVIRONMENT_IS_PTHREAD,"Internal Error! terminateAllThreads() can only ever be called from main application thread!");for(var worker of PThread.runningWorkers){terminateWorker(worker)}for(var worker of PThread.unusedWorkers){terminateWorker(worker)}PThread.unusedWorkers=[];PThread.runningWorkers=[];PThread.pthreads={}},returnWorkerToPool:worker=>{var pthread_ptr=worker.pthread_ptr;delete PThread.pthreads[pthread_ptr];PThread.unusedWorkers.push(worker);PThread.runningWorkers.splice(PThread.runningWorkers.indexOf(worker),1);worker.pthread_ptr=0;__emscripten_thread_free_data(pthread_ptr)},threadInitTLS(){PThread.tlsInitFunctions.forEach(f=>f())},loadWasmModuleToWorker:worker=>new Promise(onFinishedLoading=>{worker.onmessage=e=>{var d=e["data"];var cmd=d.cmd;if(d.targetThread&&d.targetThread!=_pthread_self()){var targetWorker=PThread.pthreads[d.targetThread];if(targetWorker){targetWorker.postMessage(d,d.transferList)}else{err(`Internal error! Worker sent a message "${cmd}" to target pthread ${d.targetThread}, but that thread no longer exists!`)}return}if(cmd==="checkMailbox"){checkMailbox()}else if(cmd==="spawnThread"){spawnThread(d)}else if(cmd==="cleanupThread"){callUserCallback(()=>cleanupThread(d.thread))}else if(cmd==="loaded"){worker.loaded=true;onFinishedLoading(worker)}else if(d.target==="setimmediate"){worker.postMessage(d)}else if(cmd==="uncaughtException"){worker.onerror(d.error)}else if(cmd==="callHandler"){Module[d.handler](...d.args)}else if(cmd){err(`worker sent an unknown command ${cmd}`)}};worker.onerror=e=>{var message="worker sent an error!";if(worker.pthread_ptr){message=`Pthread ${ptrToString(worker.pthread_ptr)} sent an error!`}err(`${message} ${e.filename}:${e.lineno}: ${e.message}`);throw e};if(ENVIRONMENT_IS_NODE){worker.on("message",data=>worker.onmessage({data}));worker.on("error",e=>worker.onerror(e))}assert(wasmMemory instanceof WebAssembly.Memory,"WebAssembly memory should have been loaded by now!");assert(wasmModule instanceof WebAssembly.Module,"WebAssembly Module should have been loaded by now!");var handlers=[];var knownHandlers=["onExit","onAbort","print","printErr"];for(var handler of knownHandlers){if(Module.propertyIsEnumerable(handler)){handlers.push(handler)}}worker.postMessage({cmd:"load",handlers,wasmMemory,wasmModule,workerID:worker.workerID})}),allocateUnusedWorker(){var worker;var pthreadMainJs=_scriptName;if(Module["mainScriptUrlOrBlob"]){pthreadMainJs=Module["mainScriptUrlOrBlob"];if(typeof pthreadMainJs!="string"){pthreadMainJs=URL.createObjectURL(pthreadMainJs)}}worker=new Worker(pthreadMainJs,{workerData:"em-pthread",name:"em-pthread-"+PThread.nextWorkerID});worker.workerID=PThread.nextWorkerID++;PThread.unusedWorkers.push(worker)},getNewWorker(){if(PThread.unusedWorkers.length==0){if(!ENVIRONMENT_IS_NODE){err("Tried to spawn a new thread, but the thread pool is exhausted.\\n"+"This might result in a deadlock unless some threads eventually exit or the code explicitly breaks out to the event loop.\\n"+"If you want to increase the pool size, use setting `-sPTHREAD_POOL_SIZE=...`."+"\\nIf you want to throw an explicit error instead of the risk of deadlocking in those cases, use setting `-sPTHREAD_POOL_SIZE_STRICT=2`.")}PThread.allocateUnusedWorker();PThread.loadWasmModuleToWorker(PThread.unusedWorkers[0])}return PThread.unusedWorkers.pop()}};var onPostRuns=[];var addOnPostRun=cb=>onPostRuns.push(cb);var runDependencies=0;var dependenciesFulfilled=null;var runDependencyTracking={};var runDependencyWatcher=null;var removeRunDependency=id=>{runDependencies--;Module["monitorRunDependencies"]?.(runDependencies);assert(id,"removeRunDependency requires an ID");assert(runDependencyTracking[id]);delete runDependencyTracking[id];if(runDependencies==0){if(runDependencyWatcher!==null){clearInterval(runDependencyWatcher);runDependencyWatcher=null}if(dependenciesFulfilled){var callback=dependenciesFulfilled;dependenciesFulfilled=null;callback()}}};var addRunDependency=id=>{runDependencies++;Module["monitorRunDependencies"]?.(runDependencies);assert(id,"addRunDependency requires an ID");assert(!runDependencyTracking[id]);runDependencyTracking[id]=1;if(runDependencyWatcher===null&&globalThis.setInterval){runDependencyWatcher=setInterval(()=>{if(ABORT){clearInterval(runDependencyWatcher);runDependencyWatcher=null;return}var shown=false;for(var dep in runDependencyTracking){if(!shown){shown=true;err("still waiting on run dependencies:")}err(`dependency: ${dep}`)}if(shown){err("(end of list)")}},1e4);runDependencyWatcher.unref?.()}};var dynCalls={};var dynCallLegacy=(sig,ptr,args)=>{sig=sig.replace(/p/g,"i");assert(sig in dynCalls,`bad function pointer type - sig is not in dynCalls: \'${sig}\'`);if(args?.length){assert(args.length===sig.length-1)}else{assert(sig.length==1)}var f=dynCalls[sig];return f(ptr,...args)};var dynCall=(sig,ptr,args=[],promising=false)=>{assert(ptr,`null function pointer in dynCall`);assert(!promising,"async dynCall is not supported in this mode");var rtn=dynCallLegacy(sig,ptr,args);function convert(rtn){return rtn}return convert(rtn)};function establishStackSpace(pthread_ptr){var stackHigh=(growMemViews(),HEAPU32)[pthread_ptr+48>>2];var stackSize=(growMemViews(),HEAPU32)[pthread_ptr+52>>2];var stackLow=stackHigh-stackSize;assert(stackHigh!=0);assert(stackLow!=0);assert(stackHigh>stackLow,"stackHigh must be higher then stackLow");_emscripten_stack_set_limits(stackHigh,stackLow);stackRestore(stackHigh);writeStackCookie()}function getValue(ptr,type="i8"){if(type.endsWith("*"))type="*";switch(type){case"i1":return(growMemViews(),HEAP8)[ptr];case"i8":return(growMemViews(),HEAP8)[ptr];case"i16":return(growMemViews(),HEAP16)[ptr>>1];case"i32":return(growMemViews(),HEAP32)[ptr>>2];case"i64":return(growMemViews(),HEAP64)[ptr>>3];case"float":return(growMemViews(),HEAPF32)[ptr>>2];case"double":return(growMemViews(),HEAPF64)[ptr>>3];case"*":return(growMemViews(),HEAPU32)[ptr>>2];default:abort(`invalid type for getValue: ${type}`)}}var invokeEntryPoint=(ptr,arg)=>{runtimeKeepaliveCounter=0;noExitRuntime=0;var result=(a1=>dynCall_ii(ptr,a1))(arg);checkStackCookie();function finish(result){if(keepRuntimeAlive()){EXITSTATUS=result;return}__emscripten_thread_exit(result)}finish(result)};var noExitRuntime=true;var registerTLSInit=tlsInitFunc=>PThread.tlsInitFunctions.push(tlsInitFunc);function setValue(ptr,value,type="i8"){if(type.endsWith("*"))type="*";switch(type){case"i1":(growMemViews(),HEAP8)[ptr]=value;break;case"i8":(growMemViews(),HEAP8)[ptr]=value;break;case"i16":(growMemViews(),HEAP16)[ptr>>1]=value;break;case"i32":(growMemViews(),HEAP32)[ptr>>2]=value;break;case"i64":(growMemViews(),HEAP64)[ptr>>3]=BigInt(value);break;case"float":(growMemViews(),HEAPF32)[ptr>>2]=value;break;case"double":(growMemViews(),HEAPF64)[ptr>>3]=value;break;case"*":(growMemViews(),HEAPU32)[ptr>>2]=value;break;default:abort(`invalid type for setValue: ${type}`)}}var warnOnce=text=>{warnOnce.shown||={};if(!warnOnce.shown[text]){warnOnce.shown[text]=1;if(ENVIRONMENT_IS_NODE)text="warning: "+text;err(text)}};var wasmMemory;var UTF8Decoder=globalThis.TextDecoder&&new TextDecoder;var findStringEnd=(heapOrArray,idx,maxBytesToRead,ignoreNul)=>{var maxIdx=idx+maxBytesToRead;if(ignoreNul)return maxIdx;while(heapOrArray[idx]&&!(idx>=maxIdx))++idx;return idx};var UTF8ArrayToString=(heapOrArray,idx=0,maxBytesToRead,ignoreNul)=>{var endPtr=findStringEnd(heapOrArray,idx,maxBytesToRead,ignoreNul);if(endPtr-idx>16&&heapOrArray.buffer&&UTF8Decoder){return UTF8Decoder.decode(heapOrArray.buffer instanceof ArrayBuffer?heapOrArray.subarray(idx,endPtr):heapOrArray.slice(idx,endPtr))}var str="";while(idx<endPtr){var u0=heapOrArray[idx++];if(!(u0&128)){str+=String.fromCharCode(u0);continue}var u1=heapOrArray[idx++]&63;if((u0&224)==192){str+=String.fromCharCode((u0&31)<<6|u1);continue}var u2=heapOrArray[idx++]&63;if((u0&240)==224){u0=(u0&15)<<12|u1<<6|u2}else{if((u0&248)!=240)warnOnce(`Invalid UTF-8 leading byte ${ptrToString(u0)} encountered when deserializing a UTF-8 string in wasm memory to a JS string!`);u0=(u0&7)<<18|u1<<12|u2<<6|heapOrArray[idx++]&63}if(u0<65536){str+=String.fromCharCode(u0)}else{var ch=u0-65536;str+=String.fromCharCode(55296|ch>>10,56320|ch&1023)}}return str};var UTF8ToString=(ptr,maxBytesToRead,ignoreNul)=>{assert(typeof ptr=="number",`UTF8ToString expects a number (got ${typeof ptr})`);return ptr?UTF8ArrayToString((growMemViews(),HEAPU8),ptr,maxBytesToRead,ignoreNul):""};var ___assert_fail=(condition,filename,line,func)=>abort(`Assertion failed: ${UTF8ToString(condition)}, at: `+[filename?UTF8ToString(filename):"unknown filename",line,func?UTF8ToString(func):"unknown function"]);class ExceptionInfo{constructor(excPtr){this.excPtr=excPtr;this.ptr=excPtr-24}set_type(type){(growMemViews(),HEAPU32)[this.ptr+4>>2]=type}get_type(){return(growMemViews(),HEAPU32)[this.ptr+4>>2]}set_destructor(destructor){(growMemViews(),HEAPU32)[this.ptr+8>>2]=destructor}get_destructor(){return(growMemViews(),HEAPU32)[this.ptr+8>>2]}set_caught(caught){caught=caught?1:0;(growMemViews(),HEAP8)[this.ptr+12]=caught}get_caught(){return(growMemViews(),HEAP8)[this.ptr+12]!=0}set_rethrown(rethrown){rethrown=rethrown?1:0;(growMemViews(),HEAP8)[this.ptr+13]=rethrown}get_rethrown(){return(growMemViews(),HEAP8)[this.ptr+13]!=0}init(type,destructor){this.set_adjusted_ptr(0);this.set_type(type);this.set_destructor(destructor)}set_adjusted_ptr(adjustedPtr){(growMemViews(),HEAPU32)[this.ptr+16>>2]=adjustedPtr}get_adjusted_ptr(){return(growMemViews(),HEAPU32)[this.ptr+16>>2]}}var uncaughtExceptionCount=0;var ___cxa_throw=(ptr,type,destructor)=>{var info=new ExceptionInfo(ptr);info.init(type,destructor);uncaughtExceptionCount++;assert(false,"Exception thrown, but exception catching is not enabled. Compile with -sNO_DISABLE_EXCEPTION_CATCHING or -sEXCEPTION_CATCHING_ALLOWED=[..] to catch.")};function pthreadCreateProxied(pthread_ptr,attr,startRoutine,arg){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(2,0,1,pthread_ptr,attr,startRoutine,arg);return ___pthread_create_js(pthread_ptr,attr,startRoutine,arg)}var _emscripten_has_threading_support=()=>!!globalThis.SharedArrayBuffer;var ___pthread_create_js=(pthread_ptr,attr,startRoutine,arg)=>{if(!_emscripten_has_threading_support()){dbg("pthread_create: environment does not support SharedArrayBuffer, pthreads are not available");return 6}var transferList=[];var error=0;if(ENVIRONMENT_IS_PTHREAD&&(transferList.length===0||error)){return pthreadCreateProxied(pthread_ptr,attr,startRoutine,arg)}if(error)return error;var threadParams={startRoutine,pthread_ptr,arg,transferList};if(ENVIRONMENT_IS_PTHREAD){threadParams.cmd="spawnThread";postMessage(threadParams,transferList);return 0}return spawnThread(threadParams)};var syscallGetVarargI=()=>{assert(SYSCALLS.varargs!=undefined);var ret=(growMemViews(),HEAP32)[+SYSCALLS.varargs>>2];SYSCALLS.varargs+=4;return ret};var syscallGetVarargP=syscallGetVarargI;var PATH={isAbs:path=>path.charAt(0)==="/",splitPath:filename=>{var splitPathRe=/^(\\/?|)([\\s\\S]*?)((?:\\.{1,2}|[^\\/]+?|)(\\.[^.\\/]*|))(?:[\\/]*)$/;return splitPathRe.exec(filename).slice(1)},normalizeArray:(parts,allowAboveRoot)=>{var up=0;for(var i=parts.length-1;i>=0;i--){var last=parts[i];if(last==="."){parts.splice(i,1)}else if(last===".."){parts.splice(i,1);up++}else if(up){parts.splice(i,1);up--}}if(allowAboveRoot){for(;up;up--){parts.unshift("..")}}return parts},normalize:path=>{var isAbsolute=PATH.isAbs(path),trailingSlash=path.slice(-1)==="/";path=PATH.normalizeArray(path.split("/").filter(p=>!!p),!isAbsolute).join("/");if(!path&&!isAbsolute){path="."}if(path&&trailingSlash){path+="/"}return(isAbsolute?"/":"")+path},dirname:path=>{var result=PATH.splitPath(path),root=result[0],dir=result[1];if(!root&&!dir){return"."}if(dir){dir=dir.slice(0,-1)}return root+dir},basename:path=>path&&path.match(/([^\\/]+|\\/)\\/*$/)[1],join:(...paths)=>PATH.normalize(paths.join("/")),join2:(l,r)=>PATH.normalize(l+"/"+r)};var initRandomFill=()=>{if(ENVIRONMENT_IS_NODE){var nodeCrypto=require("node:crypto");return view=>nodeCrypto.randomFillSync(view)}return view=>(view.set(crypto.getRandomValues(new Uint8Array(view.byteLength))),0)};var randomFill=view=>(randomFill=initRandomFill())(view);var PATH_FS={resolve:(...args)=>{var resolvedPath="",resolvedAbsolute=false;for(var i=args.length-1;i>=-1&&!resolvedAbsolute;i--){var path=i>=0?args[i]:FS.cwd();if(typeof path!="string"){throw new TypeError("Arguments to path.resolve must be strings")}else if(!path){return""}resolvedPath=path+"/"+resolvedPath;resolvedAbsolute=PATH.isAbs(path)}resolvedPath=PATH.normalizeArray(resolvedPath.split("/").filter(p=>!!p),!resolvedAbsolute).join("/");return(resolvedAbsolute?"/":"")+resolvedPath||"."},relative:(from,to)=>{from=PATH_FS.resolve(from).slice(1);to=PATH_FS.resolve(to).slice(1);function trim(arr){var start=0;for(;start<arr.length;start++){if(arr[start]!=="")break}var end=arr.length-1;for(;end>=0;end--){if(arr[end]!=="")break}if(start>end)return[];return arr.slice(start,end-start+1)}var fromParts=trim(from.split("/"));var toParts=trim(to.split("/"));var length=Math.min(fromParts.length,toParts.length);var samePartsLength=length;for(var i=0;i<length;i++){if(fromParts[i]!==toParts[i]){samePartsLength=i;break}}var outputParts=[];for(var i=samePartsLength;i<fromParts.length;i++){outputParts.push("..")}outputParts=outputParts.concat(toParts.slice(samePartsLength));return outputParts.join("/")}};var FS_stdin_getChar_buffer=[];var lengthBytesUTF8=str=>{var len=0;for(var i=0;i<str.length;++i){var c=str.charCodeAt(i);if(c<=127){len++}else if(c<=2047){len+=2}else if(c>=55296&&c<=57343){len+=4;++i}else{len+=3}}return len};var stringToUTF8Array=(str,heap,outIdx,maxBytesToWrite)=>{assert(typeof str==="string",`stringToUTF8Array expects a string (got ${typeof str})`);if(!(maxBytesToWrite>0))return 0;var startIdx=outIdx;var endIdx=outIdx+maxBytesToWrite-1;for(var i=0;i<str.length;++i){var u=str.codePointAt(i);if(u<=127){if(outIdx>=endIdx)break;heap[outIdx++]=u}else if(u<=2047){if(outIdx+1>=endIdx)break;heap[outIdx++]=192|u>>6;heap[outIdx++]=128|u&63}else if(u<=65535){if(outIdx+2>=endIdx)break;heap[outIdx++]=224|u>>12;heap[outIdx++]=128|u>>6&63;heap[outIdx++]=128|u&63}else{if(outIdx+3>=endIdx)break;if(u>1114111)warnOnce(`Invalid Unicode code point ${ptrToString(u)} encountered when serializing a JS string to a UTF-8 string in wasm memory! (Valid unicode code points should be in range 0-0x10FFFF).`);heap[outIdx++]=240|u>>18;heap[outIdx++]=128|u>>12&63;heap[outIdx++]=128|u>>6&63;heap[outIdx++]=128|u&63;i++}}heap[outIdx]=0;return outIdx-startIdx};var intArrayFromString=(stringy,dontAddNull,length)=>{var len=length>0?length:lengthBytesUTF8(stringy)+1;var u8array=new Array(len);var numBytesWritten=stringToUTF8Array(stringy,u8array,0,u8array.length);if(dontAddNull)u8array.length=numBytesWritten;return u8array};var FS_stdin_getChar=()=>{if(!FS_stdin_getChar_buffer.length){var result=null;if(ENVIRONMENT_IS_NODE){var BUFSIZE=256;var buf=Buffer.alloc(BUFSIZE);var bytesRead=0;var fd=process.stdin.fd;try{bytesRead=fs.readSync(fd,buf,0,BUFSIZE)}catch(e){if(e.toString().includes("EOF"))bytesRead=0;else throw e}if(bytesRead>0){result=buf.slice(0,bytesRead).toString("utf-8")}}else if(globalThis.window?.prompt){result=window.prompt("Input: ");if(result!==null){result+="\\n"}}else{}if(!result){return null}FS_stdin_getChar_buffer=intArrayFromString(result,true)}return FS_stdin_getChar_buffer.shift()};var TTY={ttys:[],init(){},shutdown(){},register(dev,ops){TTY.ttys[dev]={input:[],output:[],ops};FS.registerDevice(dev,TTY.stream_ops)},stream_ops:{open(stream){var tty=TTY.ttys[stream.node.rdev];if(!tty){throw new FS.ErrnoError(43)}stream.tty=tty;stream.seekable=false},close(stream){stream.tty.ops.fsync(stream.tty)},fsync(stream){stream.tty.ops.fsync(stream.tty)},read(stream,buffer,offset,length,pos){if(!stream.tty||!stream.tty.ops.get_char){throw new FS.ErrnoError(60)}var bytesRead=0;for(var i=0;i<length;i++){var result;try{result=stream.tty.ops.get_char(stream.tty)}catch(e){throw new FS.ErrnoError(29)}if(result===undefined&&bytesRead===0){throw new FS.ErrnoError(6)}if(result===null||result===undefined)break;bytesRead++;buffer[offset+i]=result}if(bytesRead){stream.node.atime=Date.now()}return bytesRead},write(stream,buffer,offset,length,pos){if(!stream.tty||!stream.tty.ops.put_char){throw new FS.ErrnoError(60)}try{for(var i=0;i<length;i++){stream.tty.ops.put_char(stream.tty,buffer[offset+i])}}catch(e){throw new FS.ErrnoError(29)}if(length){stream.node.mtime=stream.node.ctime=Date.now()}return i}},default_tty_ops:{get_char(tty){return FS_stdin_getChar()},put_char(tty,val){if(val===null||val===10){out(UTF8ArrayToString(tty.output));tty.output=[]}else{if(val!=0)tty.output.push(val)}},fsync(tty){if(tty.output?.length>0){out(UTF8ArrayToString(tty.output));tty.output=[]}},ioctl_tcgets(tty){return{c_iflag:25856,c_oflag:5,c_cflag:191,c_lflag:35387,c_cc:[3,28,127,21,4,0,1,0,17,19,26,0,18,15,23,22,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]}},ioctl_tcsets(tty,optional_actions,data){return 0},ioctl_tiocgwinsz(tty){return[24,80]}},default_tty1_ops:{put_char(tty,val){if(val===null||val===10){err(UTF8ArrayToString(tty.output));tty.output=[]}else{if(val!=0)tty.output.push(val)}},fsync(tty){if(tty.output?.length>0){err(UTF8ArrayToString(tty.output));tty.output=[]}}}};var zeroMemory=(ptr,size)=>(growMemViews(),HEAPU8).fill(0,ptr,ptr+size);var alignMemory=(size,alignment)=>{assert(alignment,"alignment argument is required");return Math.ceil(size/alignment)*alignment};var mmapAlloc=size=>{size=alignMemory(size,65536);var ptr=_emscripten_builtin_memalign(65536,size);if(ptr)zeroMemory(ptr,size);return ptr};var MEMFS={ops_table:null,mount(mount){return MEMFS.createNode(null,"/",16895,0)},createNode(parent,name,mode,dev){if(FS.isBlkdev(mode)||FS.isFIFO(mode)){throw new FS.ErrnoError(63)}MEMFS.ops_table||={dir:{node:{getattr:MEMFS.node_ops.getattr,setattr:MEMFS.node_ops.setattr,lookup:MEMFS.node_ops.lookup,mknod:MEMFS.node_ops.mknod,rename:MEMFS.node_ops.rename,unlink:MEMFS.node_ops.unlink,rmdir:MEMFS.node_ops.rmdir,readdir:MEMFS.node_ops.readdir,symlink:MEMFS.node_ops.symlink},stream:{llseek:MEMFS.stream_ops.llseek}},file:{node:{getattr:MEMFS.node_ops.getattr,setattr:MEMFS.node_ops.setattr},stream:{llseek:MEMFS.stream_ops.llseek,read:MEMFS.stream_ops.read,write:MEMFS.stream_ops.write,mmap:MEMFS.stream_ops.mmap,msync:MEMFS.stream_ops.msync}},link:{node:{getattr:MEMFS.node_ops.getattr,setattr:MEMFS.node_ops.setattr,readlink:MEMFS.node_ops.readlink},stream:{}},chrdev:{node:{getattr:MEMFS.node_ops.getattr,setattr:MEMFS.node_ops.setattr},stream:FS.chrdev_stream_ops}};var node=FS.createNode(parent,name,mode,dev);if(FS.isDir(node.mode)){node.node_ops=MEMFS.ops_table.dir.node;node.stream_ops=MEMFS.ops_table.dir.stream;node.contents={}}else if(FS.isFile(node.mode)){node.node_ops=MEMFS.ops_table.file.node;node.stream_ops=MEMFS.ops_table.file.stream;node.usedBytes=0;node.contents=MEMFS.emptyFileContents??=new Uint8Array(0)}else if(FS.isLink(node.mode)){node.node_ops=MEMFS.ops_table.link.node;node.stream_ops=MEMFS.ops_table.link.stream}else if(FS.isChrdev(node.mode)){node.node_ops=MEMFS.ops_table.chrdev.node;node.stream_ops=MEMFS.ops_table.chrdev.stream}node.atime=node.mtime=node.ctime=Date.now();if(parent){parent.contents[name]=node;parent.atime=parent.mtime=parent.ctime=node.atime}return node},getFileDataAsTypedArray(node){assert(FS.isFile(node.mode),"getFileDataAsTypedArray called on non-file");return node.contents.subarray(0,node.usedBytes)},expandFileStorage(node,newCapacity){var prevCapacity=node.contents.length;if(prevCapacity>=newCapacity)return;var CAPACITY_DOUBLING_MAX=1024*1024;newCapacity=Math.max(newCapacity,prevCapacity*(prevCapacity<CAPACITY_DOUBLING_MAX?2:1.125)>>>0);if(prevCapacity)newCapacity=Math.max(newCapacity,256);var oldContents=MEMFS.getFileDataAsTypedArray(node);node.contents=new Uint8Array(newCapacity);node.contents.set(oldContents)},resizeFileStorage(node,newSize){if(node.usedBytes==newSize)return;var oldContents=node.contents;node.contents=new Uint8Array(newSize);node.contents.set(oldContents.subarray(0,Math.min(newSize,node.usedBytes)));node.usedBytes=newSize},node_ops:{getattr(node){var attr={};attr.dev=FS.isChrdev(node.mode)?node.id:1;attr.ino=node.id;attr.mode=node.mode;attr.nlink=1;attr.uid=0;attr.gid=0;attr.rdev=node.rdev;if(FS.isDir(node.mode)){attr.size=4096}else if(FS.isFile(node.mode)){attr.size=node.usedBytes}else if(FS.isLink(node.mode)){attr.size=node.link.length}else{attr.size=0}attr.atime=new Date(node.atime);attr.mtime=new Date(node.mtime);attr.ctime=new Date(node.ctime);attr.blksize=4096;attr.blocks=Math.ceil(attr.size/attr.blksize);return attr},setattr(node,attr){for(const key of["mode","atime","mtime","ctime"]){if(attr[key]!=null){node[key]=attr[key]}}if(attr.size!==undefined){MEMFS.resizeFileStorage(node,attr.size)}},lookup(parent,name){throw new FS.ErrnoError(44)},mknod(parent,name,mode,dev){return MEMFS.createNode(parent,name,mode,dev)},rename(old_node,new_dir,new_name){var new_node;try{new_node=FS.lookupNode(new_dir,new_name)}catch(e){}if(new_node){if(FS.isDir(old_node.mode)){for(var i in new_node.contents){throw new FS.ErrnoError(55)}}FS.hashRemoveNode(new_node)}delete old_node.parent.contents[old_node.name];new_dir.contents[new_name]=old_node;old_node.name=new_name;new_dir.ctime=new_dir.mtime=old_node.parent.ctime=old_node.parent.mtime=Date.now()},unlink(parent,name){delete parent.contents[name];parent.ctime=parent.mtime=Date.now()},rmdir(parent,name){var node=FS.lookupNode(parent,name);for(var i in node.contents){throw new FS.ErrnoError(55)}delete parent.contents[name];parent.ctime=parent.mtime=Date.now()},readdir(node){return[".","..",...Object.keys(node.contents)]},symlink(parent,newname,oldpath){var node=MEMFS.createNode(parent,newname,511|40960,0);node.link=oldpath;return node},readlink(node){if(!FS.isLink(node.mode)){throw new FS.ErrnoError(28)}return node.link}},stream_ops:{read(stream,buffer,offset,length,position){var contents=stream.node.contents;if(position>=stream.node.usedBytes)return 0;var size=Math.min(stream.node.usedBytes-position,length);assert(size>=0);buffer.set(contents.subarray(position,position+size),offset);return size},write(stream,buffer,offset,length,position,canOwn){assert(buffer.subarray,"FS.write expects a TypedArray");if(buffer.buffer===(growMemViews(),HEAP8).buffer){canOwn=false}if(!length)return 0;var node=stream.node;node.mtime=node.ctime=Date.now();if(canOwn){assert(position===0,"canOwn must imply no weird position inside the file");node.contents=buffer.subarray(offset,offset+length);node.usedBytes=length}else if(node.usedBytes===0&&position===0){node.contents=buffer.slice(offset,offset+length);node.usedBytes=length}else{MEMFS.expandFileStorage(node,position+length);node.contents.set(buffer.subarray(offset,offset+length),position);node.usedBytes=Math.max(node.usedBytes,position+length)}return length},llseek(stream,offset,whence){var position=offset;if(whence===1){position+=stream.position}else if(whence===2){if(FS.isFile(stream.node.mode)){position+=stream.node.usedBytes}}if(position<0){throw new FS.ErrnoError(28)}return position},mmap(stream,length,position,prot,flags){if(!FS.isFile(stream.node.mode)){throw new FS.ErrnoError(43)}var ptr;var allocated;var contents=stream.node.contents;if(!(flags&2)&&contents.buffer===(growMemViews(),HEAP8).buffer){allocated=false;ptr=contents.byteOffset}else{allocated=true;ptr=mmapAlloc(length);if(!ptr){throw new FS.ErrnoError(48)}if(contents){if(position>0||position+length<contents.length){if(contents.subarray){contents=contents.subarray(position,position+length)}else{contents=Array.prototype.slice.call(contents,position,position+length)}}(growMemViews(),HEAP8).set(contents,ptr)}}return{ptr,allocated}},msync(stream,buffer,offset,length,mmapFlags){MEMFS.stream_ops.write(stream,buffer,0,length,offset,false);return 0}}};var FS_modeStringToFlags=str=>{if(typeof str!="string")return str;var flagModes={r:0,"r+":2,w:512|64|1,"w+":512|64|2,a:1024|64|1,"a+":1024|64|2};var flags=flagModes[str];if(typeof flags=="undefined"){throw new Error(`Unknown file open mode: ${str}`)}return flags};var FS_fileDataToTypedArray=data=>{if(typeof data=="string"){data=intArrayFromString(data,true)}if(!data.subarray){data=new Uint8Array(data)}return data};var FS_getMode=(canRead,canWrite)=>{var mode=0;if(canRead)mode|=292|73;if(canWrite)mode|=146;return mode};var strError=errno=>UTF8ToString(_strerror(errno));var ERRNO_CODES={EPERM:63,ENOENT:44,ESRCH:71,EINTR:27,EIO:29,ENXIO:60,E2BIG:1,ENOEXEC:45,EBADF:8,ECHILD:12,EAGAIN:6,EWOULDBLOCK:6,ENOMEM:48,EACCES:2,EFAULT:21,ENOTBLK:105,EBUSY:10,EEXIST:20,EXDEV:75,ENODEV:43,ENOTDIR:54,EISDIR:31,EINVAL:28,ENFILE:41,EMFILE:33,ENOTTY:59,ETXTBSY:74,EFBIG:22,ENOSPC:51,ESPIPE:70,EROFS:69,EMLINK:34,EPIPE:64,EDOM:18,ERANGE:68,ENOMSG:49,EIDRM:24,ECHRNG:106,EL2NSYNC:156,EL3HLT:107,EL3RST:108,ELNRNG:109,EUNATCH:110,ENOCSI:111,EL2HLT:112,EDEADLK:16,ENOLCK:46,EBADE:113,EBADR:114,EXFULL:115,ENOANO:104,EBADRQC:103,EBADSLT:102,EDEADLOCK:16,EBFONT:101,ENOSTR:100,ENODATA:116,ETIME:117,ENOSR:118,ENONET:119,ENOPKG:120,EREMOTE:121,ENOLINK:47,EADV:122,ESRMNT:123,ECOMM:124,EPROTO:65,EMULTIHOP:36,EDOTDOT:125,EBADMSG:9,ENOTUNIQ:126,EBADFD:127,EREMCHG:128,ELIBACC:129,ELIBBAD:130,ELIBSCN:131,ELIBMAX:132,ELIBEXEC:133,ENOSYS:52,ENOTEMPTY:55,ENAMETOOLONG:37,ELOOP:32,EOPNOTSUPP:138,EPFNOSUPPORT:139,ECONNRESET:15,ENOBUFS:42,EAFNOSUPPORT:5,EPROTOTYPE:67,ENOTSOCK:57,ENOPROTOOPT:50,ESHUTDOWN:140,ECONNREFUSED:14,EADDRINUSE:3,ECONNABORTED:13,ENETUNREACH:40,ENETDOWN:38,ETIMEDOUT:73,EHOSTDOWN:142,EHOSTUNREACH:23,EINPROGRESS:26,EALREADY:7,EDESTADDRREQ:17,EMSGSIZE:35,EPROTONOSUPPORT:66,ESOCKTNOSUPPORT:137,EADDRNOTAVAIL:4,ENETRESET:39,EISCONN:30,ENOTCONN:53,ETOOMANYREFS:141,EUSERS:136,EDQUOT:19,ESTALE:72,ENOTSUP:138,ENOMEDIUM:148,EILSEQ:25,EOVERFLOW:61,ECANCELED:11,ENOTRECOVERABLE:56,EOWNERDEAD:62,ESTRPIPE:135};var asyncLoad=async url=>{var arrayBuffer=await readAsync(url);assert(arrayBuffer,`Loading data file "${url}" failed (no arrayBuffer).`);return new Uint8Array(arrayBuffer)};var FS_createDataFile=(...args)=>FS.createDataFile(...args);var getUniqueRunDependency=id=>{var orig=id;while(1){if(!runDependencyTracking[id])return id;id=orig+Math.random()}};var preloadPlugins=[];var FS_handledByPreloadPlugin=async(byteArray,fullname)=>{if(typeof Browser!="undefined")Browser.init();for(var plugin of preloadPlugins){if(plugin["canHandle"](fullname)){assert(plugin["handle"].constructor.name==="AsyncFunction","Filesystem plugin handlers must be async functions (See #24914)");return plugin["handle"](byteArray,fullname)}}return byteArray};var FS_preloadFile=async(parent,name,url,canRead,canWrite,dontCreateFile,canOwn,preFinish)=>{var fullname=name?PATH_FS.resolve(PATH.join2(parent,name)):parent;var dep=getUniqueRunDependency(`cp ${fullname}`);addRunDependency(dep);try{var byteArray=url;if(typeof url=="string"){byteArray=await asyncLoad(url)}byteArray=await FS_handledByPreloadPlugin(byteArray,fullname);preFinish?.();if(!dontCreateFile){FS_createDataFile(parent,name,byteArray,canRead,canWrite,canOwn)}}finally{removeRunDependency(dep)}};var FS_createPreloadedFile=(parent,name,url,canRead,canWrite,onload,onerror,dontCreateFile,canOwn,preFinish)=>{FS_preloadFile(parent,name,url,canRead,canWrite,dontCreateFile,canOwn,preFinish).then(onload).catch(onerror)};var FS={root:null,mounts:[],devices:{},streams:[],nextInode:1,nameTable:null,currentPath:"/",initialized:false,ignorePermissions:true,filesystems:null,syncFSRequests:0,ErrnoError:class extends Error{name="ErrnoError";constructor(errno){super(runtimeInitialized?strError(errno):"");this.errno=errno;for(var key in ERRNO_CODES){if(ERRNO_CODES[key]===errno){this.code=key;break}}}},FSStream:class{shared={};get object(){return this.node}set object(val){this.node=val}get isRead(){return(this.flags&2097155)!==1}get isWrite(){return(this.flags&2097155)!==0}get isAppend(){return this.flags&1024}get flags(){return this.shared.flags}set flags(val){this.shared.flags=val}get position(){return this.shared.position}set position(val){this.shared.position=val}},FSNode:class{node_ops={};stream_ops={};readMode=292|73;writeMode=146;mounted=null;constructor(parent,name,mode,rdev){if(!parent){parent=this}this.parent=parent;this.mount=parent.mount;this.id=FS.nextInode++;this.name=name;this.mode=mode;this.rdev=rdev;this.atime=this.mtime=this.ctime=Date.now()}get read(){return(this.mode&this.readMode)===this.readMode}set read(val){val?this.mode|=this.readMode:this.mode&=~this.readMode}get write(){return(this.mode&this.writeMode)===this.writeMode}set write(val){val?this.mode|=this.writeMode:this.mode&=~this.writeMode}get isFolder(){return FS.isDir(this.mode)}get isDevice(){return FS.isChrdev(this.mode)}},lookupPath(path,opts={}){if(!path){throw new FS.ErrnoError(44)}opts.follow_mount??=true;if(!PATH.isAbs(path)){path=FS.cwd()+"/"+path}linkloop:for(var nlinks=0;nlinks<40;nlinks++){var parts=path.split("/").filter(p=>!!p);var current=FS.root;var current_path="/";for(var i=0;i<parts.length;i++){var islast=i===parts.length-1;if(islast&&opts.parent){break}if(parts[i]==="."){continue}if(parts[i]===".."){current_path=PATH.dirname(current_path);if(FS.isRoot(current)){path=current_path+"/"+parts.slice(i+1).join("/");nlinks--;continue linkloop}else{current=current.parent}continue}current_path=PATH.join2(current_path,parts[i]);try{current=FS.lookupNode(current,parts[i])}catch(e){if(e?.errno===44&&islast&&opts.noent_okay){return{path:current_path}}throw e}if(FS.isMountpoint(current)&&(!islast||opts.follow_mount)){current=current.mounted.root}if(FS.isLink(current.mode)&&(!islast||opts.follow)){if(!current.node_ops.readlink){throw new FS.ErrnoError(52)}var link=current.node_ops.readlink(current);if(!PATH.isAbs(link)){link=PATH.dirname(current_path)+"/"+link}path=link+"/"+parts.slice(i+1).join("/");continue linkloop}}return{path:current_path,node:current}}throw new FS.ErrnoError(32)},getPath(node){var path;while(true){if(FS.isRoot(node)){var mount=node.mount.mountpoint;if(!path)return mount;return mount[mount.length-1]!=="/"?`${mount}/${path}`:mount+path}path=path?`${node.name}/${path}`:node.name;node=node.parent}},hashName(parentid,name){var hash=0;for(var i=0;i<name.length;i++){hash=(hash<<5)-hash+name.charCodeAt(i)|0}return(parentid+hash>>>0)%FS.nameTable.length},hashAddNode(node){var hash=FS.hashName(node.parent.id,node.name);node.name_next=FS.nameTable[hash];FS.nameTable[hash]=node},hashRemoveNode(node){var hash=FS.hashName(node.parent.id,node.name);if(FS.nameTable[hash]===node){FS.nameTable[hash]=node.name_next}else{var current=FS.nameTable[hash];while(current){if(current.name_next===node){current.name_next=node.name_next;break}current=current.name_next}}},lookupNode(parent,name){var errCode=FS.mayLookup(parent);if(errCode){throw new FS.ErrnoError(errCode)}var hash=FS.hashName(parent.id,name);for(var node=FS.nameTable[hash];node;node=node.name_next){var nodeName=node.name;if(node.parent.id===parent.id&&nodeName===name){return node}}return FS.lookup(parent,name)},createNode(parent,name,mode,rdev){assert(typeof parent=="object");var node=new FS.FSNode(parent,name,mode,rdev);FS.hashAddNode(node);return node},destroyNode(node){FS.hashRemoveNode(node)},isRoot(node){return node===node.parent},isMountpoint(node){return!!node.mounted},isFile(mode){return(mode&61440)===32768},isDir(mode){return(mode&61440)===16384},isLink(mode){return(mode&61440)===40960},isChrdev(mode){return(mode&61440)===8192},isBlkdev(mode){return(mode&61440)===24576},isFIFO(mode){return(mode&61440)===4096},isSocket(mode){return(mode&49152)===49152},flagsToPermissionString(flag){var perms=["r","w","rw"][flag&3];if(flag&512){perms+="w"}return perms},nodePermissions(node,perms){if(FS.ignorePermissions){return 0}if(perms.includes("r")&&!(node.mode&292)){return 2}if(perms.includes("w")&&!(node.mode&146)){return 2}if(perms.includes("x")&&!(node.mode&73)){return 2}return 0},mayLookup(dir){if(!FS.isDir(dir.mode))return 54;var errCode=FS.nodePermissions(dir,"x");if(errCode)return errCode;if(!dir.node_ops.lookup)return 2;return 0},mayCreate(dir,name){if(!FS.isDir(dir.mode)){return 54}try{var node=FS.lookupNode(dir,name);return 20}catch(e){}return FS.nodePermissions(dir,"wx")},mayDelete(dir,name,isdir){var node;try{node=FS.lookupNode(dir,name)}catch(e){return e.errno}var errCode=FS.nodePermissions(dir,"wx");if(errCode){return errCode}if(isdir){if(!FS.isDir(node.mode)){return 54}if(FS.isRoot(node)||FS.getPath(node)===FS.cwd()){return 10}}else if(FS.isDir(node.mode)){return 31}return 0},mayOpen(node,flags){if(!node){return 44}if(FS.isLink(node.mode)){return 32}var mode=FS.flagsToPermissionString(flags);if(FS.isDir(node.mode)){if(mode!=="r"||flags&(512|64)){return 31}}return FS.nodePermissions(node,mode)},checkOpExists(op,err){if(!op){throw new FS.ErrnoError(err)}return op},MAX_OPEN_FDS:4096,nextfd(){for(var fd=0;fd<=FS.MAX_OPEN_FDS;fd++){if(!FS.streams[fd]){return fd}}throw new FS.ErrnoError(33)},getStreamChecked(fd){var stream=FS.getStream(fd);if(!stream){throw new FS.ErrnoError(8)}return stream},getStream:fd=>FS.streams[fd],createStream(stream,fd=-1){assert(fd>=-1);stream=Object.assign(new FS.FSStream,stream);if(fd==-1){fd=FS.nextfd()}stream.fd=fd;FS.streams[fd]=stream;return stream},closeStream(fd){FS.streams[fd]=null},dupStream(origStream,fd=-1){var stream=FS.createStream(origStream,fd);stream.stream_ops?.dup?.(stream);return stream},doSetAttr(stream,node,attr){var setattr=stream?.stream_ops.setattr;var arg=setattr?stream:node;setattr??=node.node_ops.setattr;FS.checkOpExists(setattr,63);setattr(arg,attr)},chrdev_stream_ops:{open(stream){var device=FS.getDevice(stream.node.rdev);stream.stream_ops=device.stream_ops;stream.stream_ops.open?.(stream)},llseek(){throw new FS.ErrnoError(70)}},major:dev=>dev>>8,minor:dev=>dev&255,makedev:(ma,mi)=>ma<<8|mi,registerDevice(dev,ops){FS.devices[dev]={stream_ops:ops}},getDevice:dev=>FS.devices[dev],getMounts(mount){var mounts=[];var check=[mount];while(check.length){var m=check.pop();mounts.push(m);check.push(...m.mounts)}return mounts},syncfs(populate,callback){if(typeof populate=="function"){callback=populate;populate=false}FS.syncFSRequests++;if(FS.syncFSRequests>1){err(`warning: ${FS.syncFSRequests} FS.syncfs operations in flight at once, probably just doing extra work`)}var mounts=FS.getMounts(FS.root.mount);var completed=0;function doCallback(errCode){assert(FS.syncFSRequests>0);FS.syncFSRequests--;return callback(errCode)}function done(errCode){if(errCode){if(!done.errored){done.errored=true;return doCallback(errCode)}return}if(++completed>=mounts.length){doCallback(null)}}for(var mount of mounts){if(mount.type.syncfs){mount.type.syncfs(mount,populate,done)}else{done(null)}}},mount(type,opts,mountpoint){if(typeof type=="string"){throw type}var root=mountpoint==="/";var pseudo=!mountpoint;var node;if(root&&FS.root){throw new FS.ErrnoError(10)}else if(!root&&!pseudo){var lookup=FS.lookupPath(mountpoint,{follow_mount:false});mountpoint=lookup.path;node=lookup.node;if(FS.isMountpoint(node)){throw new FS.ErrnoError(10)}if(!FS.isDir(node.mode)){throw new FS.ErrnoError(54)}}var mount={type,opts,mountpoint,mounts:[]};var mountRoot=type.mount(mount);mountRoot.mount=mount;mount.root=mountRoot;if(root){FS.root=mountRoot}else if(node){node.mounted=mount;if(node.mount){node.mount.mounts.push(mount)}}return mountRoot},unmount(mountpoint){var lookup=FS.lookupPath(mountpoint,{follow_mount:false});if(!FS.isMountpoint(lookup.node)){throw new FS.ErrnoError(28)}var node=lookup.node;var mount=node.mounted;var mounts=FS.getMounts(mount);for(var[hash,current]of Object.entries(FS.nameTable)){while(current){var next=current.name_next;if(mounts.includes(current.mount)){FS.destroyNode(current)}current=next}}node.mounted=null;var idx=node.mount.mounts.indexOf(mount);assert(idx!==-1);node.mount.mounts.splice(idx,1)},lookup(parent,name){return parent.node_ops.lookup(parent,name)},mknod(path,mode,dev){var lookup=FS.lookupPath(path,{parent:true});var parent=lookup.node;var name=PATH.basename(path);if(!name){throw new FS.ErrnoError(28)}if(name==="."||name===".."){throw new FS.ErrnoError(20)}var errCode=FS.mayCreate(parent,name);if(errCode){throw new FS.ErrnoError(errCode)}if(!parent.node_ops.mknod){throw new FS.ErrnoError(63)}return parent.node_ops.mknod(parent,name,mode,dev)},statfs(path){return FS.statfsNode(FS.lookupPath(path,{follow:true}).node)},statfsStream(stream){return FS.statfsNode(stream.node)},statfsNode(node){var rtn={bsize:4096,frsize:4096,blocks:1e6,bfree:5e5,bavail:5e5,files:FS.nextInode,ffree:FS.nextInode-1,fsid:42,flags:2,namelen:255};if(node.node_ops.statfs){Object.assign(rtn,node.node_ops.statfs(node.mount.opts.root))}return rtn},create(path,mode=438){mode&=4095;mode|=32768;return FS.mknod(path,mode,0)},mkdir(path,mode=511){mode&=511|512;mode|=16384;return FS.mknod(path,mode,0)},mkdirTree(path,mode){var dirs=path.split("/");var d="";for(var dir of dirs){if(!dir)continue;if(d||PATH.isAbs(path))d+="/";d+=dir;try{FS.mkdir(d,mode)}catch(e){if(e.errno!=20)throw e}}},mkdev(path,mode,dev){if(typeof dev=="undefined"){dev=mode;mode=438}mode|=8192;return FS.mknod(path,mode,dev)},symlink(oldpath,newpath){if(!PATH_FS.resolve(oldpath)){throw new FS.ErrnoError(44)}var lookup=FS.lookupPath(newpath,{parent:true});var parent=lookup.node;if(!parent){throw new FS.ErrnoError(44)}var newname=PATH.basename(newpath);var errCode=FS.mayCreate(parent,newname);if(errCode){throw new FS.ErrnoError(errCode)}if(!parent.node_ops.symlink){throw new FS.ErrnoError(63)}return parent.node_ops.symlink(parent,newname,oldpath)},rename(old_path,new_path){var old_dirname=PATH.dirname(old_path);var new_dirname=PATH.dirname(new_path);var old_name=PATH.basename(old_path);var new_name=PATH.basename(new_path);var lookup,old_dir,new_dir;lookup=FS.lookupPath(old_path,{parent:true});old_dir=lookup.node;lookup=FS.lookupPath(new_path,{parent:true});new_dir=lookup.node;if(!old_dir||!new_dir)throw new FS.ErrnoError(44);if(old_dir.mount!==new_dir.mount){throw new FS.ErrnoError(75)}var old_node=FS.lookupNode(old_dir,old_name);var relative=PATH_FS.relative(old_path,new_dirname);if(relative.charAt(0)!=="."){throw new FS.ErrnoError(28)}relative=PATH_FS.relative(new_path,old_dirname);if(relative.charAt(0)!=="."){throw new FS.ErrnoError(55)}var new_node;try{new_node=FS.lookupNode(new_dir,new_name)}catch(e){}if(old_node===new_node){return}var isdir=FS.isDir(old_node.mode);var errCode=FS.mayDelete(old_dir,old_name,isdir);if(errCode){throw new FS.ErrnoError(errCode)}errCode=new_node?FS.mayDelete(new_dir,new_name,isdir):FS.mayCreate(new_dir,new_name);if(errCode){throw new FS.ErrnoError(errCode)}if(!old_dir.node_ops.rename){throw new FS.ErrnoError(63)}if(FS.isMountpoint(old_node)||new_node&&FS.isMountpoint(new_node)){throw new FS.ErrnoError(10)}if(new_dir!==old_dir){errCode=FS.nodePermissions(old_dir,"w");if(errCode){throw new FS.ErrnoError(errCode)}}FS.hashRemoveNode(old_node);try{old_dir.node_ops.rename(old_node,new_dir,new_name);old_node.parent=new_dir}catch(e){throw e}finally{FS.hashAddNode(old_node)}},rmdir(path){var lookup=FS.lookupPath(path,{parent:true});var parent=lookup.node;var name=PATH.basename(path);var node=FS.lookupNode(parent,name);var errCode=FS.mayDelete(parent,name,true);if(errCode){throw new FS.ErrnoError(errCode)}if(!parent.node_ops.rmdir){throw new FS.ErrnoError(63)}if(FS.isMountpoint(node)){throw new FS.ErrnoError(10)}parent.node_ops.rmdir(parent,name);FS.destroyNode(node)},readdir(path){var lookup=FS.lookupPath(path,{follow:true});var node=lookup.node;var readdir=FS.checkOpExists(node.node_ops.readdir,54);return readdir(node)},unlink(path){var lookup=FS.lookupPath(path,{parent:true});var parent=lookup.node;if(!parent){throw new FS.ErrnoError(44)}var name=PATH.basename(path);var node=FS.lookupNode(parent,name);var errCode=FS.mayDelete(parent,name,false);if(errCode){throw new FS.ErrnoError(errCode)}if(!parent.node_ops.unlink){throw new FS.ErrnoError(63)}if(FS.isMountpoint(node)){throw new FS.ErrnoError(10)}parent.node_ops.unlink(parent,name);FS.destroyNode(node)},readlink(path){var lookup=FS.lookupPath(path);var link=lookup.node;if(!link){throw new FS.ErrnoError(44)}if(!link.node_ops.readlink){throw new FS.ErrnoError(28)}return link.node_ops.readlink(link)},stat(path,dontFollow){var lookup=FS.lookupPath(path,{follow:!dontFollow});var node=lookup.node;var getattr=FS.checkOpExists(node.node_ops.getattr,63);return getattr(node)},fstat(fd){var stream=FS.getStreamChecked(fd);var node=stream.node;var getattr=stream.stream_ops.getattr;var arg=getattr?stream:node;getattr??=node.node_ops.getattr;FS.checkOpExists(getattr,63);return getattr(arg)},lstat(path){return FS.stat(path,true)},doChmod(stream,node,mode,dontFollow){FS.doSetAttr(stream,node,{mode:mode&4095|node.mode&~4095,ctime:Date.now(),dontFollow})},chmod(path,mode,dontFollow){var node;if(typeof path=="string"){var lookup=FS.lookupPath(path,{follow:!dontFollow});node=lookup.node}else{node=path}FS.doChmod(null,node,mode,dontFollow)},lchmod(path,mode){FS.chmod(path,mode,true)},fchmod(fd,mode){var stream=FS.getStreamChecked(fd);FS.doChmod(stream,stream.node,mode,false)},doChown(stream,node,dontFollow){FS.doSetAttr(stream,node,{timestamp:Date.now(),dontFollow})},chown(path,uid,gid,dontFollow){var node;if(typeof path=="string"){var lookup=FS.lookupPath(path,{follow:!dontFollow});node=lookup.node}else{node=path}FS.doChown(null,node,dontFollow)},lchown(path,uid,gid){FS.chown(path,uid,gid,true)},fchown(fd,uid,gid){var stream=FS.getStreamChecked(fd);FS.doChown(stream,stream.node,false)},doTruncate(stream,node,len){if(FS.isDir(node.mode)){throw new FS.ErrnoError(31)}if(!FS.isFile(node.mode)){throw new FS.ErrnoError(28)}var errCode=FS.nodePermissions(node,"w");if(errCode){throw new FS.ErrnoError(errCode)}FS.doSetAttr(stream,node,{size:len,timestamp:Date.now()})},truncate(path,len){if(len<0){throw new FS.ErrnoError(28)}var node;if(typeof path=="string"){var lookup=FS.lookupPath(path,{follow:true});node=lookup.node}else{node=path}FS.doTruncate(null,node,len)},ftruncate(fd,len){var stream=FS.getStreamChecked(fd);if(len<0||(stream.flags&2097155)===0){throw new FS.ErrnoError(28)}FS.doTruncate(stream,stream.node,len)},utime(path,atime,mtime){var lookup=FS.lookupPath(path,{follow:true});var node=lookup.node;var setattr=FS.checkOpExists(node.node_ops.setattr,63);setattr(node,{atime,mtime})},open(path,flags,mode=438){if(path===""){throw new FS.ErrnoError(44)}flags=FS_modeStringToFlags(flags);if(flags&64){mode=mode&4095|32768}else{mode=0}var node;var isDirPath;if(typeof path=="object"){node=path}else{isDirPath=path.endsWith("/");var lookup=FS.lookupPath(path,{follow:!(flags&131072),noent_okay:true});node=lookup.node;path=lookup.path}var created=false;if(flags&64){if(node){if(flags&128){throw new FS.ErrnoError(20)}}else if(isDirPath){throw new FS.ErrnoError(31)}else{node=FS.mknod(path,mode|511,0);created=true}}if(!node){throw new FS.ErrnoError(44)}if(FS.isChrdev(node.mode)){flags&=~512}if(flags&65536&&!FS.isDir(node.mode)){throw new FS.ErrnoError(54)}if(!created){var errCode=FS.mayOpen(node,flags);if(errCode){throw new FS.ErrnoError(errCode)}}if(flags&512&&!created){FS.truncate(node,0)}flags&=~(128|512|131072);var stream=FS.createStream({node,path:FS.getPath(node),flags,seekable:true,position:0,stream_ops:node.stream_ops,ungotten:[],error:false});if(stream.stream_ops.open){stream.stream_ops.open(stream)}if(created){FS.chmod(node,mode&511)}return stream},close(stream){if(FS.isClosed(stream)){throw new FS.ErrnoError(8)}if(stream.getdents)stream.getdents=null;try{if(stream.stream_ops.close){stream.stream_ops.close(stream)}}catch(e){throw e}finally{FS.closeStream(stream.fd)}stream.fd=null},isClosed(stream){return stream.fd===null},llseek(stream,offset,whence){if(FS.isClosed(stream)){throw new FS.ErrnoError(8)}if(!stream.seekable||!stream.stream_ops.llseek){throw new FS.ErrnoError(70)}if(whence!=0&&whence!=1&&whence!=2){throw new FS.ErrnoError(28)}stream.position=stream.stream_ops.llseek(stream,offset,whence);stream.ungotten=[];return stream.position},read(stream,buffer,offset,length,position){assert(offset>=0);if(length<0||position<0){throw new FS.ErrnoError(28)}if(FS.isClosed(stream)){throw new FS.ErrnoError(8)}if((stream.flags&2097155)===1){throw new FS.ErrnoError(8)}if(FS.isDir(stream.node.mode)){throw new FS.ErrnoError(31)}if(!stream.stream_ops.read){throw new FS.ErrnoError(28)}var seeking=typeof position!="undefined";if(!seeking){position=stream.position}else if(!stream.seekable){throw new FS.ErrnoError(70)}var bytesRead=stream.stream_ops.read(stream,buffer,offset,length,position);if(!seeking)stream.position+=bytesRead;return bytesRead},write(stream,buffer,offset,length,position,canOwn){assert(offset>=0);assert(buffer.subarray,"FS.write expects a TypedArray");if(length<0||position<0){throw new FS.ErrnoError(28)}if(FS.isClosed(stream)){throw new FS.ErrnoError(8)}if((stream.flags&2097155)===0){throw new FS.ErrnoError(8)}if(FS.isDir(stream.node.mode)){throw new FS.ErrnoError(31)}if(!stream.stream_ops.write){throw new FS.ErrnoError(28)}if(stream.seekable&&stream.flags&1024){FS.llseek(stream,0,2)}var seeking=typeof position!="undefined";if(!seeking){position=stream.position}else if(!stream.seekable){throw new FS.ErrnoError(70)}var bytesWritten=stream.stream_ops.write(stream,buffer,offset,length,position,canOwn);if(!seeking)stream.position+=bytesWritten;return bytesWritten},mmap(stream,length,position,prot,flags){if((prot&2)!==0&&(flags&2)===0&&(stream.flags&2097155)!==2){throw new FS.ErrnoError(2)}if((stream.flags&2097155)===1){throw new FS.ErrnoError(2)}if(!stream.stream_ops.mmap){throw new FS.ErrnoError(43)}if(!length){throw new FS.ErrnoError(28)}return stream.stream_ops.mmap(stream,length,position,prot,flags)},msync(stream,buffer,offset,length,mmapFlags){assert(offset>=0);if(!stream.stream_ops.msync){return 0}return stream.stream_ops.msync(stream,buffer,offset,length,mmapFlags)},ioctl(stream,cmd,arg){if(!stream.stream_ops.ioctl){throw new FS.ErrnoError(59)}return stream.stream_ops.ioctl(stream,cmd,arg)},readFile(path,opts={}){opts.flags=opts.flags||0;opts.encoding=opts.encoding||"binary";if(opts.encoding!=="utf8"&&opts.encoding!=="binary"){abort(`Invalid encoding type "${opts.encoding}"`)}var stream=FS.open(path,opts.flags);var stat=FS.stat(path);var length=stat.size;var buf=new Uint8Array(length);FS.read(stream,buf,0,length,0);if(opts.encoding==="utf8"){buf=UTF8ArrayToString(buf)}FS.close(stream);return buf},writeFile(path,data,opts={}){opts.flags=opts.flags||577;var stream=FS.open(path,opts.flags,opts.mode);data=FS_fileDataToTypedArray(data);FS.write(stream,data,0,data.byteLength,undefined,opts.canOwn);FS.close(stream)},cwd:()=>FS.currentPath,chdir(path){var lookup=FS.lookupPath(path,{follow:true});if(lookup.node===null){throw new FS.ErrnoError(44)}if(!FS.isDir(lookup.node.mode)){throw new FS.ErrnoError(54)}var errCode=FS.nodePermissions(lookup.node,"x");if(errCode){throw new FS.ErrnoError(errCode)}FS.currentPath=lookup.path},createDefaultDirectories(){FS.mkdir("/tmp");FS.mkdir("/home");FS.mkdir("/home/web_user")},createDefaultDevices(){FS.mkdir("/dev");FS.registerDevice(FS.makedev(1,3),{read:()=>0,write:(stream,buffer,offset,length,pos)=>length,llseek:()=>0});FS.mkdev("/dev/null",FS.makedev(1,3));TTY.register(FS.makedev(5,0),TTY.default_tty_ops);TTY.register(FS.makedev(6,0),TTY.default_tty1_ops);FS.mkdev("/dev/tty",FS.makedev(5,0));FS.mkdev("/dev/tty1",FS.makedev(6,0));var randomBuffer=new Uint8Array(1024),randomLeft=0;var randomByte=()=>{if(randomLeft===0){randomFill(randomBuffer);randomLeft=randomBuffer.byteLength}return randomBuffer[--randomLeft]};FS.createDevice("/dev","random",randomByte);FS.createDevice("/dev","urandom",randomByte);FS.mkdir("/dev/shm");FS.mkdir("/dev/shm/tmp")},createSpecialDirectories(){FS.mkdir("/proc");var proc_self=FS.mkdir("/proc/self");FS.mkdir("/proc/self/fd");FS.mount({mount(){var node=FS.createNode(proc_self,"fd",16895,73);node.stream_ops={llseek:MEMFS.stream_ops.llseek};node.node_ops={lookup(parent,name){var fd=+name;var stream=FS.getStreamChecked(fd);var ret={parent:null,mount:{mountpoint:"fake"},node_ops:{readlink:()=>stream.path},id:fd+1};ret.parent=ret;return ret},readdir(){return Array.from(FS.streams.entries()).filter(([k,v])=>v).map(([k,v])=>k.toString())}};return node}},{},"/proc/self/fd")},createStandardStreams(input,output,error){if(input){FS.createDevice("/dev","stdin",input)}else{FS.symlink("/dev/tty","/dev/stdin")}if(output){FS.createDevice("/dev","stdout",null,output)}else{FS.symlink("/dev/tty","/dev/stdout")}if(error){FS.createDevice("/dev","stderr",null,error)}else{FS.symlink("/dev/tty1","/dev/stderr")}var stdin=FS.open("/dev/stdin",0);var stdout=FS.open("/dev/stdout",1);var stderr=FS.open("/dev/stderr",1);assert(stdin.fd===0,`invalid handle for stdin (${stdin.fd})`);assert(stdout.fd===1,`invalid handle for stdout (${stdout.fd})`);assert(stderr.fd===2,`invalid handle for stderr (${stderr.fd})`)},staticInit(){FS.nameTable=new Array(4096);FS.mount(MEMFS,{},"/");FS.createDefaultDirectories();FS.createDefaultDevices();FS.createSpecialDirectories();FS.filesystems={MEMFS}},init(input,output,error){assert(!FS.initialized,"FS.init was previously called. If you want to initialize later with custom parameters, remove any earlier calls (note that one is automatically added to the generated code)");FS.initialized=true;input??=Module["stdin"];output??=Module["stdout"];error??=Module["stderr"];FS.createStandardStreams(input,output,error)},quit(){FS.initialized=false;_fflush(0);for(var stream of FS.streams){if(stream){FS.close(stream)}}},findObject(path,dontResolveLastLink){var ret=FS.analyzePath(path,dontResolveLastLink);if(!ret.exists){return null}return ret.object},analyzePath(path,dontResolveLastLink){try{var lookup=FS.lookupPath(path,{follow:!dontResolveLastLink});path=lookup.path}catch(e){}var ret={isRoot:false,exists:false,error:0,name:null,path:null,object:null,parentExists:false,parentPath:null,parentObject:null};try{var lookup=FS.lookupPath(path,{parent:true});ret.parentExists=true;ret.parentPath=lookup.path;ret.parentObject=lookup.node;ret.name=PATH.basename(path);lookup=FS.lookupPath(path,{follow:!dontResolveLastLink});ret.exists=true;ret.path=lookup.path;ret.object=lookup.node;ret.name=lookup.node.name;ret.isRoot=lookup.path==="/"}catch(e){ret.error=e.errno}return ret},createPath(parent,path,canRead,canWrite){parent=typeof parent=="string"?parent:FS.getPath(parent);var parts=path.split("/").reverse();while(parts.length){var part=parts.pop();if(!part)continue;var current=PATH.join2(parent,part);try{FS.mkdir(current)}catch(e){if(e.errno!=20)throw e}parent=current}return current},createFile(parent,name,properties,canRead,canWrite){var path=PATH.join2(typeof parent=="string"?parent:FS.getPath(parent),name);var mode=FS_getMode(canRead,canWrite);return FS.create(path,mode)},createDataFile(parent,name,data,canRead,canWrite,canOwn){var path=name;if(parent){parent=typeof parent=="string"?parent:FS.getPath(parent);path=name?PATH.join2(parent,name):parent}var mode=FS_getMode(canRead,canWrite);var node=FS.create(path,mode);if(data){data=FS_fileDataToTypedArray(data);FS.chmod(node,mode|146);var stream=FS.open(node,577);FS.write(stream,data,0,data.length,0,canOwn);FS.close(stream);FS.chmod(node,mode)}},createDevice(parent,name,input,output){var path=PATH.join2(typeof parent=="string"?parent:FS.getPath(parent),name);var mode=FS_getMode(!!input,!!output);FS.createDevice.major??=64;var dev=FS.makedev(FS.createDevice.major++,0);FS.registerDevice(dev,{open(stream){stream.seekable=false},close(stream){if(output?.buffer?.length){output(10)}},read(stream,buffer,offset,length,pos){var bytesRead=0;for(var i=0;i<length;i++){var result;try{result=input()}catch(e){throw new FS.ErrnoError(29)}if(result===undefined&&bytesRead===0){throw new FS.ErrnoError(6)}if(result===null||result===undefined)break;bytesRead++;buffer[offset+i]=result}if(bytesRead){stream.node.atime=Date.now()}return bytesRead},write(stream,buffer,offset,length,pos){for(var i=0;i<length;i++){try{output(buffer[offset+i])}catch(e){throw new FS.ErrnoError(29)}}if(length){stream.node.mtime=stream.node.ctime=Date.now()}return i}});return FS.mkdev(path,mode,dev)},forceLoadFile(obj){if(obj.isDevice||obj.isFolder||obj.link||obj.contents)return true;if(globalThis.XMLHttpRequest){abort("Lazy loading should have been performed (contents set) in createLazyFile, but it was not. Lazy loading only works in web workers. Use --embed-file or --preload-file in emcc on the main thread.")}else{try{obj.contents=readBinary(obj.url)}catch(e){throw new FS.ErrnoError(29)}}},createLazyFile(parent,name,url,canRead,canWrite){class LazyUint8Array{lengthKnown=false;chunks=[];get(idx){if(idx>this.length-1||idx<0){return undefined}var chunkOffset=idx%this.chunkSize;var chunkNum=idx/this.chunkSize|0;return this.getter(chunkNum)[chunkOffset]}setDataGetter(getter){this.getter=getter}cacheLength(){var xhr=new XMLHttpRequest;xhr.open("HEAD",url,false);xhr.send(null);if(!(xhr.status>=200&&xhr.status<300||xhr.status===304))abort("Couldn\'t load "+url+". Status: "+xhr.status);var datalength=Number(xhr.getResponseHeader("Content-length"));var header;var hasByteServing=(header=xhr.getResponseHeader("Accept-Ranges"))&&header==="bytes";var usesGzip=(header=xhr.getResponseHeader("Content-Encoding"))&&header==="gzip";var chunkSize=1024*1024;if(!hasByteServing)chunkSize=datalength;var doXHR=(from,to)=>{if(from>to)abort("invalid range ("+from+", "+to+") or no bytes requested!");if(to>datalength-1)abort("only "+datalength+" bytes available! programmer error!");var xhr=new XMLHttpRequest;xhr.open("GET",url,false);if(datalength!==chunkSize)xhr.setRequestHeader("Range","bytes="+from+"-"+to);xhr.responseType="arraybuffer";if(xhr.overrideMimeType){xhr.overrideMimeType("text/plain; charset=x-user-defined")}xhr.send(null);if(!(xhr.status>=200&&xhr.status<300||xhr.status===304))abort("Couldn\'t load "+url+". Status: "+xhr.status);if(xhr.response!==undefined){return new Uint8Array(xhr.response||[])}return intArrayFromString(xhr.responseText||"",true)};var lazyArray=this;lazyArray.setDataGetter(chunkNum=>{var start=chunkNum*chunkSize;var end=(chunkNum+1)*chunkSize-1;end=Math.min(end,datalength-1);if(typeof lazyArray.chunks[chunkNum]=="undefined"){lazyArray.chunks[chunkNum]=doXHR(start,end)}if(typeof lazyArray.chunks[chunkNum]=="undefined")abort("doXHR failed!");return lazyArray.chunks[chunkNum]});if(usesGzip||!datalength){chunkSize=datalength=1;datalength=this.getter(0).length;chunkSize=datalength;out("LazyFiles on gzip forces download of the whole file when length is accessed")}this._length=datalength;this._chunkSize=chunkSize;this.lengthKnown=true}get length(){if(!this.lengthKnown){this.cacheLength()}return this._length}get chunkSize(){if(!this.lengthKnown){this.cacheLength()}return this._chunkSize}}if(globalThis.XMLHttpRequest){if(!ENVIRONMENT_IS_WORKER)abort("Cannot do synchronous binary XHRs outside webworkers in modern browsers. Use --embed-file or --preload-file in emcc");var lazyArray=new LazyUint8Array;var properties={isDevice:false,contents:lazyArray}}else{var properties={isDevice:false,url}}var node=FS.createFile(parent,name,properties,canRead,canWrite);if(properties.contents){node.contents=properties.contents}else if(properties.url){node.contents=null;node.url=properties.url}Object.defineProperties(node,{usedBytes:{get:function(){return this.contents.length}}});var stream_ops={};for(const[key,fn]of Object.entries(node.stream_ops)){stream_ops[key]=(...args)=>{FS.forceLoadFile(node);return fn(...args)}}function writeChunks(stream,buffer,offset,length,position){var contents=stream.node.contents;if(position>=contents.length)return 0;var size=Math.min(contents.length-position,length);assert(size>=0);if(contents.slice){for(var i=0;i<size;i++){buffer[offset+i]=contents[position+i]}}else{for(var i=0;i<size;i++){buffer[offset+i]=contents.get(position+i)}}return size}stream_ops.read=(stream,buffer,offset,length,position)=>{FS.forceLoadFile(node);return writeChunks(stream,buffer,offset,length,position)};stream_ops.mmap=(stream,length,position,prot,flags)=>{FS.forceLoadFile(node);var ptr=mmapAlloc(length);if(!ptr){throw new FS.ErrnoError(48)}writeChunks(stream,(growMemViews(),HEAP8),ptr,length,position);return{ptr,allocated:true}};node.stream_ops=stream_ops;return node}};var SYSCALLS={calculateAt(dirfd,path,allowEmpty){if(PATH.isAbs(path)){return path}var dir;if(dirfd===-100){dir=FS.cwd()}else{var dirstream=SYSCALLS.getStreamFromFD(dirfd);dir=dirstream.path}if(path.length==0){if(!allowEmpty){throw new FS.ErrnoError(44)}return dir}return dir+"/"+path},writeStat(buf,stat){(growMemViews(),HEAPU32)[buf>>2]=stat.dev;(growMemViews(),HEAPU32)[buf+4>>2]=stat.mode;(growMemViews(),HEAPU32)[buf+8>>2]=stat.nlink;(growMemViews(),HEAPU32)[buf+12>>2]=stat.uid;(growMemViews(),HEAPU32)[buf+16>>2]=stat.gid;(growMemViews(),HEAPU32)[buf+20>>2]=stat.rdev;(growMemViews(),HEAP64)[buf+24>>3]=BigInt(stat.size);(growMemViews(),HEAP32)[buf+32>>2]=4096;(growMemViews(),HEAP32)[buf+36>>2]=stat.blocks;var atime=stat.atime.getTime();var mtime=stat.mtime.getTime();var ctime=stat.ctime.getTime();(growMemViews(),HEAP64)[buf+40>>3]=BigInt(Math.floor(atime/1e3));(growMemViews(),HEAPU32)[buf+48>>2]=atime%1e3*1e3*1e3;(growMemViews(),HEAP64)[buf+56>>3]=BigInt(Math.floor(mtime/1e3));(growMemViews(),HEAPU32)[buf+64>>2]=mtime%1e3*1e3*1e3;(growMemViews(),HEAP64)[buf+72>>3]=BigInt(Math.floor(ctime/1e3));(growMemViews(),HEAPU32)[buf+80>>2]=ctime%1e3*1e3*1e3;(growMemViews(),HEAP64)[buf+88>>3]=BigInt(stat.ino);return 0},writeStatFs(buf,stats){(growMemViews(),HEAPU32)[buf+4>>2]=stats.bsize;(growMemViews(),HEAPU32)[buf+60>>2]=stats.bsize;(growMemViews(),HEAP64)[buf+8>>3]=BigInt(stats.blocks);(growMemViews(),HEAP64)[buf+16>>3]=BigInt(stats.bfree);(growMemViews(),HEAP64)[buf+24>>3]=BigInt(stats.bavail);(growMemViews(),HEAP64)[buf+32>>3]=BigInt(stats.files);(growMemViews(),HEAP64)[buf+40>>3]=BigInt(stats.ffree);(growMemViews(),HEAPU32)[buf+48>>2]=stats.fsid;(growMemViews(),HEAPU32)[buf+64>>2]=stats.flags;(growMemViews(),HEAPU32)[buf+56>>2]=stats.namelen},doMsync(addr,stream,len,flags,offset){if(!FS.isFile(stream.node.mode)){throw new FS.ErrnoError(43)}if(flags&2){return 0}var buffer=(growMemViews(),HEAPU8).slice(addr,addr+len);FS.msync(stream,buffer,offset,len,flags)},getStreamFromFD(fd){var stream=FS.getStreamChecked(fd);return stream},varargs:undefined,getStr(ptr){var ret=UTF8ToString(ptr);return ret}};function ___syscall_fcntl64(fd,cmd,varargs){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(3,0,1,fd,cmd,varargs);SYSCALLS.varargs=varargs;try{var stream=SYSCALLS.getStreamFromFD(fd);switch(cmd){case 0:{var arg=syscallGetVarargI();if(arg<0){return-28}while(FS.streams[arg]){arg++}var newStream;newStream=FS.dupStream(stream,arg);return newStream.fd}case 1:case 2:return 0;case 3:return stream.flags;case 4:{var arg=syscallGetVarargI();stream.flags|=arg;return 0}case 12:{var arg=syscallGetVarargP();var offset=0;(growMemViews(),HEAP16)[arg+offset>>1]=2;return 0}case 13:case 14:return 0}return-28}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return-e.errno}}function ___syscall_ioctl(fd,op,varargs){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(4,0,1,fd,op,varargs);SYSCALLS.varargs=varargs;try{var stream=SYSCALLS.getStreamFromFD(fd);switch(op){case 21509:{if(!stream.tty)return-59;return 0}case 21505:{if(!stream.tty)return-59;if(stream.tty.ops.ioctl_tcgets){var termios=stream.tty.ops.ioctl_tcgets(stream);var argp=syscallGetVarargP();(growMemViews(),HEAP32)[argp>>2]=termios.c_iflag||0;(growMemViews(),HEAP32)[argp+4>>2]=termios.c_oflag||0;(growMemViews(),HEAP32)[argp+8>>2]=termios.c_cflag||0;(growMemViews(),HEAP32)[argp+12>>2]=termios.c_lflag||0;for(var i=0;i<32;i++){(growMemViews(),HEAP8)[argp+i+17]=termios.c_cc[i]||0}return 0}return 0}case 21510:case 21511:case 21512:{if(!stream.tty)return-59;return 0}case 21506:case 21507:case 21508:{if(!stream.tty)return-59;if(stream.tty.ops.ioctl_tcsets){var argp=syscallGetVarargP();var c_iflag=(growMemViews(),HEAP32)[argp>>2];var c_oflag=(growMemViews(),HEAP32)[argp+4>>2];var c_cflag=(growMemViews(),HEAP32)[argp+8>>2];var c_lflag=(growMemViews(),HEAP32)[argp+12>>2];var c_cc=[];for(var i=0;i<32;i++){c_cc.push((growMemViews(),HEAP8)[argp+i+17])}return stream.tty.ops.ioctl_tcsets(stream.tty,op,{c_iflag,c_oflag,c_cflag,c_lflag,c_cc})}return 0}case 21519:{if(!stream.tty)return-59;var argp=syscallGetVarargP();(growMemViews(),HEAP32)[argp>>2]=0;return 0}case 21520:{if(!stream.tty)return-59;return-28}case 21537:case 21531:{var argp=syscallGetVarargP();return FS.ioctl(stream,op,argp)}case 21523:{if(!stream.tty)return-59;if(stream.tty.ops.ioctl_tiocgwinsz){var winsize=stream.tty.ops.ioctl_tiocgwinsz(stream.tty);var argp=syscallGetVarargP();(growMemViews(),HEAP16)[argp>>1]=winsize[0];(growMemViews(),HEAP16)[argp+2>>1]=winsize[1]}return 0}case 21524:{if(!stream.tty)return-59;return 0}case 21515:{if(!stream.tty)return-59;return 0}default:return-28}}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return-e.errno}}function ___syscall_openat(dirfd,path,flags,varargs){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(5,0,1,dirfd,path,flags,varargs);SYSCALLS.varargs=varargs;try{path=SYSCALLS.getStr(path);path=SYSCALLS.calculateAt(dirfd,path);var mode=varargs?syscallGetVarargI():0;return FS.open(path,flags,mode).fd}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return-e.errno}}var __abort_js=()=>abort("native code called abort()");var __emscripten_init_main_thread_js=tb=>{__emscripten_thread_init(tb,!ENVIRONMENT_IS_WORKER,1,!ENVIRONMENT_IS_WEB,65536,false);PThread.threadInitTLS()};var handleException=e=>{if(e instanceof ExitStatus||e=="unwind"){return EXITSTATUS}checkStackCookie();if(e instanceof WebAssembly.RuntimeError){if(_emscripten_stack_get_current()<=0){err("Stack overflow detected.  You can try increasing -sSTACK_SIZE (currently set to 65536)")}}quit_(1,e)};var maybeExit=()=>{if(!keepRuntimeAlive()){try{if(ENVIRONMENT_IS_PTHREAD){if(_pthread_self())__emscripten_thread_exit(EXITSTATUS);return}_exit(EXITSTATUS)}catch(e){handleException(e)}}};var callUserCallback=func=>{if(ABORT){err("user callback triggered after runtime exited or application aborted.  Ignoring.");return}try{return func()}catch(e){handleException(e)}finally{maybeExit()}};var waitAsyncPolyfilled=!Atomics.waitAsync||globalThis.navigator?.userAgent&&Number((navigator.userAgent.match(/Chrom(e|ium)\\/([0-9]+)\\./)||[])[2])<91;var __emscripten_thread_mailbox_await=pthread_ptr=>{if(!waitAsyncPolyfilled){var wait=Atomics.waitAsync((growMemViews(),HEAP32),pthread_ptr>>2,pthread_ptr);assert(wait.async);wait.value.then(checkMailbox);var waitingAsync=pthread_ptr+120;Atomics.store((growMemViews(),HEAP32),waitingAsync>>2,1)}};var checkMailbox=()=>callUserCallback(()=>{var pthread_ptr=_pthread_self();if(pthread_ptr){__emscripten_thread_mailbox_await(pthread_ptr);__emscripten_check_mailbox()}});var __emscripten_notify_mailbox_postmessage=(targetThread,currThreadId)=>{if(targetThread==currThreadId){setTimeout(checkMailbox)}else if(ENVIRONMENT_IS_PTHREAD){postMessage({targetThread,cmd:"checkMailbox"})}else{var worker=PThread.pthreads[targetThread];if(!worker){err(`Cannot send message to thread with ID ${targetThread}, unknown thread ID!`);return}worker.postMessage({cmd:"checkMailbox"})}};var proxiedJSCallArgs=[];var __emscripten_receive_on_main_thread_js=(funcIndex,emAsmAddr,callingThread,bufSize,args,ctx,ctxArgs)=>{proxiedJSCallArgs.length=0;var b=args>>3;var end=args+bufSize>>3;while(b<end){var arg;if((growMemViews(),HEAP64)[b++]){arg=(growMemViews(),HEAP64)[b++]}else{arg=(growMemViews(),HEAPF64)[b++]}proxiedJSCallArgs.push(arg)}assert(!emAsmAddr);var func=proxiedFunctionTable[funcIndex];assert(!(funcIndex&&emAsmAddr));assert(func.length==proxiedJSCallArgs.length,"Call args mismatch in _emscripten_receive_on_main_thread_js");PThread.currentProxiedOperationCallerThread=callingThread;var rtn=func(...proxiedJSCallArgs);PThread.currentProxiedOperationCallerThread=0;if(ctx){rtn.then(rtn=>__emscripten_run_js_on_main_thread_done(ctx,ctxArgs,rtn));return}assert(typeof rtn!="bigint");return rtn};var __emscripten_runtime_keepalive_clear=()=>{noExitRuntime=false;runtimeKeepaliveCounter=0};var __emscripten_thread_cleanup=thread=>{if(!ENVIRONMENT_IS_PTHREAD)cleanupThread(thread);else postMessage({cmd:"cleanupThread",thread})};var __emscripten_thread_set_strongref=thread=>{if(ENVIRONMENT_IS_NODE){PThread.pthreads[thread].ref()}};var INT53_MAX=9007199254740992;var INT53_MIN=-9007199254740992;var bigintToI53Checked=num=>num<INT53_MIN||num>INT53_MAX?NaN:Number(num);function __mmap_js(len,prot,flags,fd,offset,allocated,addr){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(6,0,1,len,prot,flags,fd,offset,allocated,addr);offset=bigintToI53Checked(offset);try{assert(!isNaN(offset));var stream=SYSCALLS.getStreamFromFD(fd);var res=FS.mmap(stream,len,offset,prot,flags);var ptr=res.ptr;(growMemViews(),HEAP32)[allocated>>2]=res.allocated;(growMemViews(),HEAPU32)[addr>>2]=ptr;return 0}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return-e.errno}}function __munmap_js(addr,len,prot,flags,fd,offset){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(7,0,1,addr,len,prot,flags,fd,offset);offset=bigintToI53Checked(offset);try{var stream=SYSCALLS.getStreamFromFD(fd);if(prot&2){SYSCALLS.doMsync(addr,stream,len,flags,offset)}}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return-e.errno}}var timers={};var _emscripten_get_now=()=>performance.timeOrigin+performance.now();function __setitimer_js(which,timeout_ms){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(8,0,1,which,timeout_ms);if(timers[which]){clearTimeout(timers[which].id);delete timers[which]}if(!timeout_ms)return 0;var id=setTimeout(()=>{assert(which in timers);delete timers[which];callUserCallback(()=>__emscripten_timeout(which,_emscripten_get_now()))},timeout_ms);timers[which]={id,timeout_ms};return 0}var stringToUTF8=(str,outPtr,maxBytesToWrite)=>{assert(typeof maxBytesToWrite=="number","stringToUTF8(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!");return stringToUTF8Array(str,(growMemViews(),HEAPU8),outPtr,maxBytesToWrite)};var __tzset_js=(timezone,daylight,std_name,dst_name)=>{var currentYear=(new Date).getFullYear();var winter=new Date(currentYear,0,1);var summer=new Date(currentYear,6,1);var winterOffset=winter.getTimezoneOffset();var summerOffset=summer.getTimezoneOffset();var stdTimezoneOffset=Math.max(winterOffset,summerOffset);(growMemViews(),HEAPU32)[timezone>>2]=stdTimezoneOffset*60;(growMemViews(),HEAP32)[daylight>>2]=Number(winterOffset!=summerOffset);var extractZone=timezoneOffset=>{var sign=timezoneOffset>=0?"-":"+";var absOffset=Math.abs(timezoneOffset);var hours=String(Math.floor(absOffset/60)).padStart(2,"0");var minutes=String(absOffset%60).padStart(2,"0");return`UTC${sign}${hours}${minutes}`};var winterName=extractZone(winterOffset);var summerName=extractZone(summerOffset);assert(winterName);assert(summerName);assert(lengthBytesUTF8(winterName)<=16,`timezone name truncated to fit in TZNAME_MAX (${winterName})`);assert(lengthBytesUTF8(summerName)<=16,`timezone name truncated to fit in TZNAME_MAX (${summerName})`);if(summerOffset<winterOffset){stringToUTF8(winterName,std_name,17);stringToUTF8(summerName,dst_name,17)}else{stringToUTF8(winterName,dst_name,17);stringToUTF8(summerName,std_name,17)}};var _emscripten_date_now=()=>Date.now();var nowIsMonotonic=1;var checkWasiClock=clock_id=>clock_id>=0&&clock_id<=3;function _clock_time_get(clk_id,ignored_precision,ptime){ignored_precision=bigintToI53Checked(ignored_precision);if(!checkWasiClock(clk_id)){return 28}var now;if(clk_id===0){now=_emscripten_date_now()}else if(nowIsMonotonic){now=_emscripten_get_now()}else{return 52}var nsec=Math.round(now*1e3*1e3);(growMemViews(),HEAP64)[ptime>>3]=BigInt(nsec);return 0}var _emscripten_check_blocking_allowed=()=>{if(ENVIRONMENT_IS_NODE)return;if(ENVIRONMENT_IS_WORKER)return;warnOnce("Blocking on the main thread is very dangerous, see https://emscripten.org/docs/porting/pthreads.html#blocking-on-the-main-browser-thread")};var _emscripten_err=str=>err(UTF8ToString(str));var runtimeKeepalivePush=()=>{runtimeKeepaliveCounter+=1};var _emscripten_exit_with_live_runtime=()=>{runtimeKeepalivePush();throw"unwind"};var getHeapMax=()=>2147483648;var _emscripten_get_heap_max=()=>getHeapMax();var _emscripten_has_asyncify=()=>1;var _emscripten_num_logical_cores=()=>ENVIRONMENT_IS_NODE?require("node:os").cpus().length:navigator["hardwareConcurrency"];var growMemory=size=>{var oldHeapSize=wasmMemory.buffer.byteLength;var pages=(size-oldHeapSize+65535)/65536|0;try{wasmMemory.grow(pages);updateMemoryViews();return 1}catch(e){err(`growMemory: Attempted to grow heap from ${oldHeapSize} bytes to ${size} bytes, but got error: ${e}`)}};var _emscripten_resize_heap=requestedSize=>{var oldSize=(growMemViews(),HEAPU8).length;requestedSize>>>=0;if(requestedSize<=oldSize){return false}var maxHeapSize=getHeapMax();if(requestedSize>maxHeapSize){err(`Cannot enlarge memory, requested ${requestedSize} bytes, but the limit is ${maxHeapSize} bytes!`);return false}for(var cutDown=1;cutDown<=4;cutDown*=2){var overGrownHeapSize=oldSize*(1+.2/cutDown);overGrownHeapSize=Math.min(overGrownHeapSize,requestedSize+100663296);var newSize=Math.min(maxHeapSize,alignMemory(Math.max(requestedSize,overGrownHeapSize),65536));var replacement=growMemory(newSize);if(replacement){return true}}err(`Failed to grow the heap from ${oldSize} bytes to ${newSize} bytes, not enough memory!`);return false};var stringToUTF8OnStack=str=>{var size=lengthBytesUTF8(str)+1;var ret=stackAlloc(size);stringToUTF8(str,ret,size);return ret};var stringToNewUTF8=str=>{var size=lengthBytesUTF8(str)+1;var ret=_malloc(size);if(ret)stringToUTF8(str,ret,size);return ret};var WebGPU={Internals:{jsObjects:[],jsObjectInsert:(ptr,jsObject)=>{ptr>>>=0;WebGPU.Internals.jsObjects[ptr]=jsObject},bufferOnUnmaps:[],futures:[],futureInsert:(futureId,promise)=>{WebGPU.Internals.futures[futureId]=new Promise(resolve=>promise.finally(()=>resolve(futureId)))}},getJsObject:ptr=>{if(!ptr)return undefined;ptr>>>=0;assert(ptr in WebGPU.Internals.jsObjects);return WebGPU.Internals.jsObjects[ptr]},importJsAdapter:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateAdapter(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsBindGroup:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateBindGroup(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsBindGroupLayout:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateBindGroupLayout(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsBuffer:(buffer,parentPtr=0)=>{assert(buffer.mapState!="pending");var mapState=buffer.mapState=="mapped"?3:1;var bufferPtr=_emwgpuCreateBuffer(parentPtr,mapState);WebGPU.Internals.jsObjectInsert(bufferPtr,buffer);if(buffer.mapState=="mapped"){WebGPU.Internals.bufferOnUnmaps[bufferPtr]=[]}return bufferPtr},importJsCommandBuffer:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateCommandBuffer(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsCommandEncoder:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateCommandEncoder(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsComputePassEncoder:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateComputePassEncoder(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsComputePipeline:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateComputePipeline(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsDevice:(device,parentPtr=0)=>{var queuePtr=_emwgpuCreateQueue(parentPtr);var devicePtr=_emwgpuCreateDevice(parentPtr,queuePtr);WebGPU.Internals.jsObjectInsert(queuePtr,device.queue);WebGPU.Internals.jsObjectInsert(devicePtr,device);return devicePtr},importJsPipelineLayout:(obj,parentPtr=0)=>{var ptr=_emwgpuCreatePipelineLayout(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsQuerySet:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateQuerySet(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsQueue:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateQueue(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsRenderBundle:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateRenderBundle(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsRenderBundleEncoder:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateRenderBundleEncoder(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsRenderPassEncoder:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateRenderPassEncoder(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsRenderPipeline:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateRenderPipeline(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsSampler:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateSampler(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsShaderModule:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateShaderModule(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsSurface:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateSurface(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsTexture:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateTexture(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsTextureView:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateTextureView(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},errorCallback:(callback,type,message,userdata)=>{var sp=stackSave();var messagePtr=stringToUTF8OnStack(message);((a1,a2,a3)=>dynCall_viii(callback,a1,a2,a3))(type,messagePtr,userdata);stackRestore(sp)},setStringView:(ptr,data,length)=>{(growMemViews(),HEAPU32)[ptr>>2]=data;(growMemViews(),HEAPU32)[ptr+4>>2]=length},makeStringFromStringView:stringViewPtr=>{var ptr=(growMemViews(),HEAPU32)[stringViewPtr>>2];var length=(growMemViews(),HEAPU32)[stringViewPtr+4>>2];return UTF8ToString(ptr,length)},makeStringFromOptionalStringView:stringViewPtr=>{var ptr=(growMemViews(),HEAPU32)[stringViewPtr>>2];var length=(growMemViews(),HEAPU32)[stringViewPtr+4>>2];if(!ptr){if(length===0){return""}return undefined}return UTF8ToString(ptr,length)},makeColor:ptr=>({r:(growMemViews(),HEAPF64)[ptr>>3],g:(growMemViews(),HEAPF64)[ptr+8>>3],b:(growMemViews(),HEAPF64)[ptr+16>>3],a:(growMemViews(),HEAPF64)[ptr+24>>3]}),makeExtent3D:ptr=>({width:(growMemViews(),HEAPU32)[ptr>>2],height:(growMemViews(),HEAPU32)[ptr+4>>2],depthOrArrayLayers:(growMemViews(),HEAPU32)[ptr+8>>2]}),makeOrigin3D:ptr=>({x:(growMemViews(),HEAPU32)[ptr>>2],y:(growMemViews(),HEAPU32)[ptr+4>>2],z:(growMemViews(),HEAPU32)[ptr+8>>2]}),makeTexelCopyTextureInfo:ptr=>{assert(ptr);return{texture:WebGPU.getJsObject((growMemViews(),HEAPU32)[ptr>>2]),mipLevel:(growMemViews(),HEAPU32)[ptr+4>>2],origin:WebGPU.makeOrigin3D(ptr+8),aspect:WebGPU.TextureAspect[(growMemViews(),HEAPU32)[ptr+20>>2]]}},makeTexelCopyBufferLayout:ptr=>{var bytesPerRow=(growMemViews(),HEAPU32)[ptr+8>>2];var rowsPerImage=(growMemViews(),HEAPU32)[ptr+12>>2];return{offset:(growMemViews(),HEAPU32)[ptr+4>>2]*4294967296+(growMemViews(),HEAPU32)[ptr>>2],bytesPerRow:bytesPerRow===4294967295?undefined:bytesPerRow,rowsPerImage:rowsPerImage===4294967295?undefined:rowsPerImage}},makeTexelCopyBufferInfo:ptr=>{assert(ptr);var layoutPtr=ptr+0;var bufferCopyView=WebGPU.makeTexelCopyBufferLayout(layoutPtr);bufferCopyView["buffer"]=WebGPU.getJsObject((growMemViews(),HEAPU32)[ptr+16>>2]);return bufferCopyView},makePassTimestampWrites:ptr=>{if(ptr===0)return undefined;return{querySet:WebGPU.getJsObject((growMemViews(),HEAPU32)[ptr+4>>2]),beginningOfPassWriteIndex:(growMemViews(),HEAPU32)[ptr+8>>2],endOfPassWriteIndex:(growMemViews(),HEAPU32)[ptr+12>>2]}},makePipelineConstants:(constantCount,constantsPtr)=>{if(!constantCount)return;var constants={};for(var i=0;i<constantCount;++i){var entryPtr=constantsPtr+24*i;var key=WebGPU.makeStringFromStringView(entryPtr+4);constants[key]=(growMemViews(),HEAPF64)[entryPtr+16>>3]}return constants},makePipelineLayout:layoutPtr=>{if(!layoutPtr)return"auto";return WebGPU.getJsObject(layoutPtr)},makeComputeState:ptr=>{if(!ptr)return undefined;assert(ptr);assert((growMemViews(),HEAPU32)[ptr>>2]===0);var desc={module:WebGPU.getJsObject((growMemViews(),HEAPU32)[ptr+4>>2]),constants:WebGPU.makePipelineConstants((growMemViews(),HEAPU32)[ptr+16>>2],(growMemViews(),HEAPU32)[ptr+20>>2]),entryPoint:WebGPU.makeStringFromOptionalStringView(ptr+8)};return desc},makeComputePipelineDesc:descriptor=>{assert(descriptor);assert((growMemViews(),HEAPU32)[descriptor>>2]===0);var desc={label:WebGPU.makeStringFromOptionalStringView(descriptor+4),layout:WebGPU.makePipelineLayout((growMemViews(),HEAPU32)[descriptor+12>>2]),compute:WebGPU.makeComputeState(descriptor+16)};return desc},makeRenderPipelineDesc:descriptor=>{assert(descriptor);assert((growMemViews(),HEAPU32)[descriptor>>2]===0);function makePrimitiveState(psPtr){if(!psPtr)return undefined;assert(psPtr);assert((growMemViews(),HEAPU32)[psPtr>>2]===0);return{topology:WebGPU.PrimitiveTopology[(growMemViews(),HEAPU32)[psPtr+4>>2]],stripIndexFormat:WebGPU.IndexFormat[(growMemViews(),HEAPU32)[psPtr+8>>2]],frontFace:WebGPU.FrontFace[(growMemViews(),HEAPU32)[psPtr+12>>2]],cullMode:WebGPU.CullMode[(growMemViews(),HEAPU32)[psPtr+16>>2]],unclippedDepth:!!(growMemViews(),HEAPU32)[psPtr+20>>2]}}function makeBlendComponent(bdPtr){if(!bdPtr)return undefined;return{operation:WebGPU.BlendOperation[(growMemViews(),HEAPU32)[bdPtr>>2]],srcFactor:WebGPU.BlendFactor[(growMemViews(),HEAPU32)[bdPtr+4>>2]],dstFactor:WebGPU.BlendFactor[(growMemViews(),HEAPU32)[bdPtr+8>>2]]}}function makeBlendState(bsPtr){if(!bsPtr)return undefined;return{alpha:makeBlendComponent(bsPtr+12),color:makeBlendComponent(bsPtr+0)}}function makeColorState(csPtr){assert(csPtr);assert((growMemViews(),HEAPU32)[csPtr>>2]===0);var formatInt=(growMemViews(),HEAPU32)[csPtr+4>>2];return formatInt===0?undefined:{format:WebGPU.TextureFormat[formatInt],blend:makeBlendState((growMemViews(),HEAPU32)[csPtr+8>>2]),writeMask:(growMemViews(),HEAPU32)[csPtr+16>>2]}}function makeColorStates(count,csArrayPtr){var states=[];for(var i=0;i<count;++i){states.push(makeColorState(csArrayPtr+24*i))}return states}function makeStencilStateFace(ssfPtr){assert(ssfPtr);return{compare:WebGPU.CompareFunction[(growMemViews(),HEAPU32)[ssfPtr>>2]],failOp:WebGPU.StencilOperation[(growMemViews(),HEAPU32)[ssfPtr+4>>2]],depthFailOp:WebGPU.StencilOperation[(growMemViews(),HEAPU32)[ssfPtr+8>>2]],passOp:WebGPU.StencilOperation[(growMemViews(),HEAPU32)[ssfPtr+12>>2]]}}function makeDepthStencilState(dssPtr){if(!dssPtr)return undefined;assert(dssPtr);return{format:WebGPU.TextureFormat[(growMemViews(),HEAPU32)[dssPtr+4>>2]],depthWriteEnabled:!!(growMemViews(),HEAPU32)[dssPtr+8>>2],depthCompare:WebGPU.CompareFunction[(growMemViews(),HEAPU32)[dssPtr+12>>2]],stencilFront:makeStencilStateFace(dssPtr+16),stencilBack:makeStencilStateFace(dssPtr+32),stencilReadMask:(growMemViews(),HEAPU32)[dssPtr+48>>2],stencilWriteMask:(growMemViews(),HEAPU32)[dssPtr+52>>2],depthBias:(growMemViews(),HEAP32)[dssPtr+56>>2],depthBiasSlopeScale:(growMemViews(),HEAPF32)[dssPtr+60>>2],depthBiasClamp:(growMemViews(),HEAPF32)[dssPtr+64>>2]}}function makeVertexAttribute(vaPtr){assert(vaPtr);return{format:WebGPU.VertexFormat[(growMemViews(),HEAPU32)[vaPtr+4>>2]],offset:(growMemViews(),HEAPU32)[vaPtr+4+8>>2]*4294967296+(growMemViews(),HEAPU32)[vaPtr+8>>2],shaderLocation:(growMemViews(),HEAPU32)[vaPtr+16>>2]}}function makeVertexAttributes(count,vaArrayPtr){var vas=[];for(var i=0;i<count;++i){vas.push(makeVertexAttribute(vaArrayPtr+i*24))}return vas}function makeVertexBuffer(vbPtr){if(!vbPtr)return undefined;var stepModeInt=(growMemViews(),HEAPU32)[vbPtr+4>>2];var attributeCountInt=(growMemViews(),HEAPU32)[vbPtr+16>>2];if(stepModeInt===0&&attributeCountInt===0){return null}return{arrayStride:(growMemViews(),HEAPU32)[vbPtr+4+8>>2]*4294967296+(growMemViews(),HEAPU32)[vbPtr+8>>2],stepMode:WebGPU.VertexStepMode[stepModeInt],attributes:makeVertexAttributes(attributeCountInt,(growMemViews(),HEAPU32)[vbPtr+20>>2])}}function makeVertexBuffers(count,vbArrayPtr){if(!count)return undefined;var vbs=[];for(var i=0;i<count;++i){vbs.push(makeVertexBuffer(vbArrayPtr+i*24))}return vbs}function makeVertexState(viPtr){if(!viPtr)return undefined;assert(viPtr);assert((growMemViews(),HEAPU32)[viPtr>>2]===0);var desc={module:WebGPU.getJsObject((growMemViews(),HEAPU32)[viPtr+4>>2]),constants:WebGPU.makePipelineConstants((growMemViews(),HEAPU32)[viPtr+16>>2],(growMemViews(),HEAPU32)[viPtr+20>>2]),buffers:makeVertexBuffers((growMemViews(),HEAPU32)[viPtr+24>>2],(growMemViews(),HEAPU32)[viPtr+28>>2]),entryPoint:WebGPU.makeStringFromOptionalStringView(viPtr+8)};return desc}function makeMultisampleState(msPtr){if(!msPtr)return undefined;assert(msPtr);assert((growMemViews(),HEAPU32)[msPtr>>2]===0);return{count:(growMemViews(),HEAPU32)[msPtr+4>>2],mask:(growMemViews(),HEAPU32)[msPtr+8>>2],alphaToCoverageEnabled:!!(growMemViews(),HEAPU32)[msPtr+12>>2]}}function makeFragmentState(fsPtr){if(!fsPtr)return undefined;assert(fsPtr);assert((growMemViews(),HEAPU32)[fsPtr>>2]===0);var desc={module:WebGPU.getJsObject((growMemViews(),HEAPU32)[fsPtr+4>>2]),constants:WebGPU.makePipelineConstants((growMemViews(),HEAPU32)[fsPtr+16>>2],(growMemViews(),HEAPU32)[fsPtr+20>>2]),targets:makeColorStates((growMemViews(),HEAPU32)[fsPtr+24>>2],(growMemViews(),HEAPU32)[fsPtr+28>>2]),entryPoint:WebGPU.makeStringFromOptionalStringView(fsPtr+8)};return desc}var desc={label:WebGPU.makeStringFromOptionalStringView(descriptor+4),layout:WebGPU.makePipelineLayout((growMemViews(),HEAPU32)[descriptor+12>>2]),vertex:makeVertexState(descriptor+16),primitive:makePrimitiveState(descriptor+48),depthStencil:makeDepthStencilState((growMemViews(),HEAPU32)[descriptor+72>>2]),multisample:makeMultisampleState(descriptor+76),fragment:makeFragmentState((growMemViews(),HEAPU32)[descriptor+92>>2])};return desc},fillLimitStruct:(limits,limitsOutPtr)=>{assert(limitsOutPtr);assert((growMemViews(),HEAPU32)[limitsOutPtr>>2]===0);function setLimitValueU32(name,limitOffset){var limitValue=limits[name];(growMemViews(),HEAP32)[limitsOutPtr+limitOffset>>2]=limitValue}function setLimitValueU64(name,limitOffset){var limitValue=limits[name];(growMemViews(),HEAP64)[limitsOutPtr+limitOffset>>3]=BigInt(limitValue)}setLimitValueU32("maxTextureDimension1D",4);setLimitValueU32("maxTextureDimension2D",8);setLimitValueU32("maxTextureDimension3D",12);setLimitValueU32("maxTextureArrayLayers",16);setLimitValueU32("maxBindGroups",20);setLimitValueU32("maxBindGroupsPlusVertexBuffers",24);setLimitValueU32("maxBindingsPerBindGroup",28);setLimitValueU32("maxDynamicUniformBuffersPerPipelineLayout",32);setLimitValueU32("maxDynamicStorageBuffersPerPipelineLayout",36);setLimitValueU32("maxSampledTexturesPerShaderStage",40);setLimitValueU32("maxSamplersPerShaderStage",44);setLimitValueU32("maxStorageBuffersPerShaderStage",48);setLimitValueU32("maxStorageTexturesPerShaderStage",52);setLimitValueU32("maxUniformBuffersPerShaderStage",56);setLimitValueU32("minUniformBufferOffsetAlignment",80);setLimitValueU32("minStorageBufferOffsetAlignment",84);setLimitValueU64("maxUniformBufferBindingSize",64);setLimitValueU64("maxStorageBufferBindingSize",72);setLimitValueU32("maxVertexBuffers",88);setLimitValueU64("maxBufferSize",96);setLimitValueU32("maxVertexAttributes",104);setLimitValueU32("maxVertexBufferArrayStride",108);setLimitValueU32("maxInterStageShaderVariables",112);setLimitValueU32("maxColorAttachments",116);setLimitValueU32("maxColorAttachmentBytesPerSample",120);setLimitValueU32("maxComputeWorkgroupStorageSize",124);setLimitValueU32("maxComputeInvocationsPerWorkgroup",128);setLimitValueU32("maxComputeWorkgroupSizeX",132);setLimitValueU32("maxComputeWorkgroupSizeY",136);setLimitValueU32("maxComputeWorkgroupSizeZ",140);setLimitValueU32("maxComputeWorkgroupsPerDimension",144);if(limits.maxImmediateSize!==undefined){setLimitValueU32("maxImmediateSize",148)}},fillAdapterInfoStruct:(info,infoStruct)=>{assert(infoStruct);assert((growMemViews(),HEAPU32)[infoStruct>>2]===0);(growMemViews(),HEAP32)[infoStruct+52>>2]=info.subgroupMinSize;(growMemViews(),HEAP32)[infoStruct+56>>2]=info.subgroupMaxSize;var strs=info.vendor+info.architecture+info.device+info.description;var strPtr=stringToNewUTF8(strs);var vendorLen=lengthBytesUTF8(info.vendor);WebGPU.setStringView(infoStruct+4,strPtr,vendorLen);strPtr+=vendorLen;var architectureLen=lengthBytesUTF8(info.architecture);WebGPU.setStringView(infoStruct+12,strPtr,architectureLen);strPtr+=architectureLen;var deviceLen=lengthBytesUTF8(info.device);WebGPU.setStringView(infoStruct+20,strPtr,deviceLen);strPtr+=deviceLen;var descriptionLen=lengthBytesUTF8(info.description);WebGPU.setStringView(infoStruct+28,strPtr,descriptionLen);strPtr+=descriptionLen;(growMemViews(),HEAP32)[infoStruct+36>>2]=2;var adapterType=info.isFallbackAdapter?3:4;(growMemViews(),HEAP32)[infoStruct+40>>2]=adapterType;(growMemViews(),HEAP32)[infoStruct+44>>2]=0;(growMemViews(),HEAP32)[infoStruct+48>>2]=0},AddressMode:[,"clamp-to-edge","repeat","mirror-repeat"],BlendFactor:[,"zero","one","src","one-minus-src","src-alpha","one-minus-src-alpha","dst","one-minus-dst","dst-alpha","one-minus-dst-alpha","src-alpha-saturated","constant","one-minus-constant","src1","one-minus-src1","src1alpha","one-minus-src1alpha"],BlendOperation:[,"add","subtract","reverse-subtract","min","max"],BufferBindingType:["binding-not-used",,"uniform","storage","read-only-storage"],BufferMapState:[,"unmapped","pending","mapped"],CompareFunction:[,"never","less","equal","less-equal","greater","not-equal","greater-equal","always"],CompilationInfoRequestStatus:[,"success","callback-cancelled"],CompositeAlphaMode:[,"opaque","premultiplied","unpremultiplied","inherit"],CullMode:[,"none","front","back"],ErrorFilter:[,"validation","out-of-memory","internal"],FeatureLevel:[,"compatibility","core"],FeatureName:{1:"core-features-and-limits",2:"depth-clip-control",3:"depth32float-stencil8",4:"texture-compression-bc",5:"texture-compression-bc-sliced-3d",6:"texture-compression-etc2",7:"texture-compression-astc",8:"texture-compression-astc-sliced-3d",9:"timestamp-query",10:"indirect-first-instance",11:"shader-f16",12:"rg11b10ufloat-renderable",13:"bgra8unorm-storage",14:"float32-filterable",15:"float32-blendable",16:"clip-distances",17:"dual-source-blending",18:"subgroups",19:"texture-formats-tier1",20:"texture-formats-tier2",21:"primitive-index",327692:"chromium-experimental-unorm16-texture-formats",327693:"chromium-experimental-snorm16-texture-formats",327732:"chromium-experimental-multi-draw-indirect"},FilterMode:[,"nearest","linear"],FrontFace:[,"ccw","cw"],IndexFormat:[,"uint16","uint32"],InstanceFeatureName:[,"timed-wait-any","shader-source-spirv","multiple-devices-per-adapter"],LoadOp:[,"load","clear"],MipmapFilterMode:[,"nearest","linear"],OptionalBool:["false","true"],PowerPreference:[,"low-power","high-performance"],PredefinedColorSpace:[,"srgb","display-p3"],PrimitiveTopology:[,"point-list","line-list","line-strip","triangle-list","triangle-strip"],QueryType:[,"occlusion","timestamp"],SamplerBindingType:["binding-not-used",,"filtering","non-filtering","comparison"],Status:[,"success","error"],StencilOperation:[,"keep","zero","replace","invert","increment-clamp","decrement-clamp","increment-wrap","decrement-wrap"],StorageTextureAccess:["binding-not-used",,"write-only","read-only","read-write"],StoreOp:[,"store","discard"],SurfaceGetCurrentTextureStatus:[,"success-optimal","success-suboptimal","timeout","outdated","lost","error"],TextureAspect:[,"all","stencil-only","depth-only"],TextureDimension:[,"1d","2d","3d"],TextureFormat:[,"r8unorm","r8snorm","r8uint","r8sint","r16unorm","r16snorm","r16uint","r16sint","r16float","rg8unorm","rg8snorm","rg8uint","rg8sint","r32float","r32uint","r32sint","rg16unorm","rg16snorm","rg16uint","rg16sint","rg16float","rgba8unorm","rgba8unorm-srgb","rgba8snorm","rgba8uint","rgba8sint","bgra8unorm","bgra8unorm-srgb","rgb10a2uint","rgb10a2unorm","rg11b10ufloat","rgb9e5ufloat","rg32float","rg32uint","rg32sint","rgba16unorm","rgba16snorm","rgba16uint","rgba16sint","rgba16float","rgba32float","rgba32uint","rgba32sint","stencil8","depth16unorm","depth24plus","depth24plus-stencil8","depth32float","depth32float-stencil8","bc1-rgba-unorm","bc1-rgba-unorm-srgb","bc2-rgba-unorm","bc2-rgba-unorm-srgb","bc3-rgba-unorm","bc3-rgba-unorm-srgb","bc4-r-unorm","bc4-r-snorm","bc5-rg-unorm","bc5-rg-snorm","bc6h-rgb-ufloat","bc6h-rgb-float","bc7-rgba-unorm","bc7-rgba-unorm-srgb","etc2-rgb8unorm","etc2-rgb8unorm-srgb","etc2-rgb8a1unorm","etc2-rgb8a1unorm-srgb","etc2-rgba8unorm","etc2-rgba8unorm-srgb","eac-r11unorm","eac-r11snorm","eac-rg11unorm","eac-rg11snorm","astc-4x4-unorm","astc-4x4-unorm-srgb","astc-5x4-unorm","astc-5x4-unorm-srgb","astc-5x5-unorm","astc-5x5-unorm-srgb","astc-6x5-unorm","astc-6x5-unorm-srgb","astc-6x6-unorm","astc-6x6-unorm-srgb","astc-8x5-unorm","astc-8x5-unorm-srgb","astc-8x6-unorm","astc-8x6-unorm-srgb","astc-8x8-unorm","astc-8x8-unorm-srgb","astc-10x5-unorm","astc-10x5-unorm-srgb","astc-10x6-unorm","astc-10x6-unorm-srgb","astc-10x8-unorm","astc-10x8-unorm-srgb","astc-10x10-unorm","astc-10x10-unorm-srgb","astc-12x10-unorm","astc-12x10-unorm-srgb","astc-12x12-unorm","astc-12x12-unorm-srgb"],TextureSampleType:["binding-not-used",,"float","unfilterable-float","depth","sint","uint"],TextureViewDimension:[,"1d","2d","2d-array","cube","cube-array","3d"],ToneMappingMode:[,"standard","extended"],VertexFormat:[,"uint8","uint8x2","uint8x4","sint8","sint8x2","sint8x4","unorm8","unorm8x2","unorm8x4","snorm8","snorm8x2","snorm8x4","uint16","uint16x2","uint16x4","sint16","sint16x2","sint16x4","unorm16","unorm16x2","unorm16x4","snorm16","snorm16x2","snorm16x4","float16","float16x2","float16x4","float32","float32x2","float32x3","float32x4","uint32","uint32x2","uint32x3","uint32x4","sint32","sint32x2","sint32x3","sint32x4","unorm10-10-10-2","unorm8x4-bgra"],VertexStepMode:[,"vertex","instance"],WGSLLanguageFeatureName:[,"readonly_and_readwrite_storage_textures","packed_4x8_integer_dot_product","unrestricted_pointer_parameters","pointer_composite_access"]};var emwgpuStringToInt_DeviceLostReason={undefined:1,unknown:1,destroyed:2};var runtimeKeepalivePop=()=>{assert(runtimeKeepaliveCounter>0);runtimeKeepaliveCounter-=1};function _emwgpuAdapterRequestDevice(adapterPtr,futureId,deviceLostFutureId,devicePtr,queuePtr,descriptor){futureId=bigintToI53Checked(futureId);deviceLostFutureId=bigintToI53Checked(deviceLostFutureId);var adapter=WebGPU.getJsObject(adapterPtr);var desc={};if(descriptor){assert(descriptor);assert((growMemViews(),HEAPU32)[descriptor>>2]===0);var requiredFeatureCount=(growMemViews(),HEAPU32)[descriptor+12>>2];if(requiredFeatureCount){var requiredFeaturesPtr=(growMemViews(),HEAPU32)[descriptor+16>>2];desc["requiredFeatures"]=Array.from((growMemViews(),HEAPU32).subarray(requiredFeaturesPtr>>2,requiredFeaturesPtr+requiredFeatureCount*4>>2),feature=>WebGPU.FeatureName[feature])}var limitsPtr=(growMemViews(),HEAPU32)[descriptor+20>>2];if(limitsPtr){assert(limitsPtr);assert((growMemViews(),HEAPU32)[limitsPtr>>2]===0);var requiredLimits={};function setLimitU32IfDefined(name,limitOffset,ignoreIfZero=false){var ptr=limitsPtr+limitOffset;var value=(growMemViews(),HEAPU32)[ptr>>2];if(value!=4294967295&&(!ignoreIfZero||value!=0)){requiredLimits[name]=value}}function setLimitU64IfDefined(name,limitOffset){var ptr=limitsPtr+limitOffset;var limitPart1=(growMemViews(),HEAPU32)[ptr>>2];var limitPart2=(growMemViews(),HEAPU32)[ptr+4>>2];if(limitPart1!=4294967295||limitPart2!=4294967295){requiredLimits[name]=(growMemViews(),HEAPU32)[ptr+4>>2]*4294967296+(growMemViews(),HEAPU32)[ptr>>2]}}setLimitU32IfDefined("maxTextureDimension1D",4);setLimitU32IfDefined("maxTextureDimension2D",8);setLimitU32IfDefined("maxTextureDimension3D",12);setLimitU32IfDefined("maxTextureArrayLayers",16);setLimitU32IfDefined("maxBindGroups",20);setLimitU32IfDefined("maxBindGroupsPlusVertexBuffers",24);setLimitU32IfDefined("maxDynamicUniformBuffersPerPipelineLayout",32);setLimitU32IfDefined("maxDynamicStorageBuffersPerPipelineLayout",36);setLimitU32IfDefined("maxSampledTexturesPerShaderStage",40);setLimitU32IfDefined("maxSamplersPerShaderStage",44);setLimitU32IfDefined("maxStorageBuffersPerShaderStage",48);setLimitU32IfDefined("maxStorageTexturesPerShaderStage",52);setLimitU32IfDefined("maxUniformBuffersPerShaderStage",56);setLimitU32IfDefined("minUniformBufferOffsetAlignment",80);setLimitU32IfDefined("minStorageBufferOffsetAlignment",84);setLimitU64IfDefined("maxUniformBufferBindingSize",64);setLimitU64IfDefined("maxStorageBufferBindingSize",72);setLimitU32IfDefined("maxVertexBuffers",88);setLimitU64IfDefined("maxBufferSize",96);setLimitU32IfDefined("maxVertexAttributes",104);setLimitU32IfDefined("maxVertexBufferArrayStride",108);setLimitU32IfDefined("maxInterStageShaderVariables",112);setLimitU32IfDefined("maxColorAttachments",116);setLimitU32IfDefined("maxColorAttachmentBytesPerSample",120);setLimitU32IfDefined("maxComputeWorkgroupStorageSize",124);setLimitU32IfDefined("maxComputeInvocationsPerWorkgroup",128);setLimitU32IfDefined("maxComputeWorkgroupSizeX",132);setLimitU32IfDefined("maxComputeWorkgroupSizeY",136);setLimitU32IfDefined("maxComputeWorkgroupSizeZ",140);setLimitU32IfDefined("maxComputeWorkgroupsPerDimension",144);setLimitU32IfDefined("maxImmediateSize",148,true);desc["requiredLimits"]=requiredLimits}var defaultQueuePtr=(growMemViews(),HEAPU32)[descriptor+24>>2];if(defaultQueuePtr){var defaultQueueDesc={label:WebGPU.makeStringFromOptionalStringView(defaultQueuePtr+4)};desc["defaultQueue"]=defaultQueueDesc}desc["label"]=WebGPU.makeStringFromOptionalStringView(descriptor+4)}runtimeKeepalivePush();WebGPU.Internals.futureInsert(futureId,adapter.requestDevice(desc).then(device=>{runtimeKeepalivePop();callUserCallback(()=>{WebGPU.Internals.jsObjectInsert(queuePtr,device.queue);WebGPU.Internals.jsObjectInsert(devicePtr,device);assert(deviceLostFutureId);WebGPU.Internals.futureInsert(deviceLostFutureId,device.lost.then(info=>{callUserCallback(()=>{device.onuncapturederror=ev=>{};var sp=stackSave();var messagePtr=stringToUTF8OnStack(info.message);_emwgpuOnDeviceLostCompleted(deviceLostFutureId,emwgpuStringToInt_DeviceLostReason[info.reason],messagePtr);stackRestore(sp)})}));assert(typeof GPUValidationError!="undefined");assert(typeof GPUOutOfMemoryError!="undefined");assert(typeof GPUInternalError!="undefined");device.onuncapturederror=ev=>{var type=5;if(ev.error instanceof GPUValidationError)type=2;else if(ev.error instanceof GPUOutOfMemoryError)type=3;else if(ev.error instanceof GPUInternalError)type=4;var sp=stackSave();var messagePtr=stringToUTF8OnStack(ev.error.message);_emwgpuOnUncapturedError(devicePtr,type,messagePtr);stackRestore(sp)};_emwgpuOnRequestDeviceCompleted(futureId,1,devicePtr,0)})},ex=>{runtimeKeepalivePop();callUserCallback(()=>{var sp=stackSave();var messagePtr=stringToUTF8OnStack(ex.message);_emwgpuOnRequestDeviceCompleted(futureId,3,devicePtr,messagePtr);if(deviceLostFutureId){_emwgpuOnDeviceLostCompleted(deviceLostFutureId,4,messagePtr)}stackRestore(sp)})}))}var _emwgpuBufferDestroy=bufferPtr=>{var buffer=WebGPU.getJsObject(bufferPtr);var onUnmap=WebGPU.Internals.bufferOnUnmaps[bufferPtr];if(onUnmap){for(var i=0;i<onUnmap.length;++i){onUnmap[i]()}delete WebGPU.Internals.bufferOnUnmaps[bufferPtr]}buffer.destroy()};var _emwgpuBufferGetConstMappedRange=(bufferPtr,offset,size)=>{var buffer=WebGPU.getJsObject(bufferPtr);if(size===0)warnOnce("getMappedRange size=0 no longer means WGPU_WHOLE_MAP_SIZE");if(size==-1)size=undefined;var mapped;try{mapped=buffer.getMappedRange(offset,size)}catch(ex){err(`buffer.getMappedRange(${offset}, ${size}) failed: ${ex}`);return 0}var data=_memalign(16,mapped.byteLength);(growMemViews(),HEAPU8).set(new Uint8Array(mapped),data);WebGPU.Internals.bufferOnUnmaps[bufferPtr].push(()=>_free(data));return data};var _emwgpuBufferGetMappedRange=(bufferPtr,offset,size)=>{var buffer=WebGPU.getJsObject(bufferPtr);if(size===0)warnOnce("getMappedRange size=0 no longer means WGPU_WHOLE_MAP_SIZE");if(size==-1)size=undefined;var mapped;try{mapped=buffer.getMappedRange(offset,size)}catch(ex){err(`buffer.getMappedRange(${offset}, ${size}) failed: ${ex}`);return 0}var data=_memalign(16,mapped.byteLength);(growMemViews(),HEAPU8).fill(0,data,mapped.byteLength);WebGPU.Internals.bufferOnUnmaps[bufferPtr].push(()=>{new Uint8Array(mapped).set((growMemViews(),HEAPU8).subarray(data,data+mapped.byteLength));_free(data)});return data};var _emwgpuBufferMapAsync=function(bufferPtr,futureId,mode,offset,size){futureId=bigintToI53Checked(futureId);mode=bigintToI53Checked(mode);var buffer=WebGPU.getJsObject(bufferPtr);WebGPU.Internals.bufferOnUnmaps[bufferPtr]=[];if(size==-1)size=undefined;runtimeKeepalivePush();WebGPU.Internals.futureInsert(futureId,buffer.mapAsync(mode,offset,size).then(()=>{runtimeKeepalivePop();callUserCallback(()=>{_emwgpuOnMapAsyncCompleted(futureId,1,0)})},ex=>{runtimeKeepalivePop();callUserCallback(()=>{var sp=stackSave();var messagePtr=stringToUTF8OnStack(ex.message);var status=ex.name==="AbortError"?4:ex.name==="OperationError"?3:0;assert(status);_emwgpuOnMapAsyncCompleted(futureId,status,messagePtr);delete WebGPU.Internals.bufferOnUnmaps[bufferPtr]})}))};var _emwgpuBufferUnmap=bufferPtr=>{var buffer=WebGPU.getJsObject(bufferPtr);var onUnmap=WebGPU.Internals.bufferOnUnmaps[bufferPtr];if(!onUnmap){return}for(var i=0;i<onUnmap.length;++i){onUnmap[i]()}delete WebGPU.Internals.bufferOnUnmaps[bufferPtr];buffer.unmap()};var _emwgpuDelete=ptr=>{delete WebGPU.Internals.jsObjects[ptr]};var _emwgpuDeviceCreateBuffer=(devicePtr,descriptor,bufferPtr)=>{assert(descriptor);assert((growMemViews(),HEAPU32)[descriptor>>2]===0);var mappedAtCreation=!!(growMemViews(),HEAPU32)[descriptor+32>>2];var desc={label:WebGPU.makeStringFromOptionalStringView(descriptor+4),usage:(growMemViews(),HEAPU32)[descriptor+16>>2],size:(growMemViews(),HEAPU32)[descriptor+4+24>>2]*4294967296+(growMemViews(),HEAPU32)[descriptor+24>>2],mappedAtCreation};var device=WebGPU.getJsObject(devicePtr);var buffer;try{buffer=device.createBuffer(desc)}catch(ex){assert(ex instanceof RangeError);assert(mappedAtCreation);err("createBuffer threw:",ex);return false}WebGPU.Internals.jsObjectInsert(bufferPtr,buffer);if(mappedAtCreation){WebGPU.Internals.bufferOnUnmaps[bufferPtr]=[]}return true};var _emwgpuDeviceCreateShaderModule=(devicePtr,descriptor,shaderModulePtr)=>{assert(descriptor);var nextInChainPtr=(growMemViews(),HEAPU32)[descriptor>>2];assert(nextInChainPtr!==0);var sType=(growMemViews(),HEAPU32)[nextInChainPtr+4>>2];var desc={label:WebGPU.makeStringFromOptionalStringView(descriptor+4),code:""};switch(sType){case 2:{desc["code"]=WebGPU.makeStringFromStringView(nextInChainPtr+8);break}default:abort("unrecognized ShaderModule sType")}var device=WebGPU.getJsObject(devicePtr);WebGPU.Internals.jsObjectInsert(shaderModulePtr,device.createShaderModule(desc))};var _emwgpuDeviceDestroy=devicePtr=>{const device=WebGPU.getJsObject(devicePtr);device.onuncapturederror=null;device.destroy()};function _emwgpuInstanceRequestAdapter(instancePtr,futureId,options,adapterPtr){futureId=bigintToI53Checked(futureId);var opts;if(options){assert(options);var featureLevel=(growMemViews(),HEAPU32)[options+4>>2];opts={featureLevel:WebGPU.FeatureLevel[featureLevel],powerPreference:WebGPU.PowerPreference[(growMemViews(),HEAPU32)[options+8>>2]],forceFallbackAdapter:!!(growMemViews(),HEAPU32)[options+12>>2]};var nextInChainPtr=(growMemViews(),HEAPU32)[options>>2];if(nextInChainPtr!==0){var sType=(growMemViews(),HEAPU32)[nextInChainPtr+4>>2];assert(sType===11);assert(0===(growMemViews(),HEAPU32)[nextInChainPtr>>2]);var webxrOptions=nextInChainPtr;assert(webxrOptions);assert((growMemViews(),HEAPU32)[webxrOptions>>2]===0);opts.xrCompatible=!!(growMemViews(),HEAPU32)[webxrOptions+8>>2]}}if(!("gpu"in navigator)){var sp=stackSave();var messagePtr=stringToUTF8OnStack("WebGPU not available on this browser (navigator.gpu is not available)");_emwgpuOnRequestAdapterCompleted(futureId,3,adapterPtr,messagePtr);stackRestore(sp);return}runtimeKeepalivePush();WebGPU.Internals.futureInsert(futureId,navigator.gpu.requestAdapter(opts).then(adapter=>{runtimeKeepalivePop();callUserCallback(()=>{if(adapter){WebGPU.Internals.jsObjectInsert(adapterPtr,adapter);_emwgpuOnRequestAdapterCompleted(futureId,1,adapterPtr,0)}else{var sp=stackSave();var messagePtr=stringToUTF8OnStack("WebGPU not available on this browser (requestAdapter returned null)");_emwgpuOnRequestAdapterCompleted(futureId,3,adapterPtr,messagePtr);stackRestore(sp)}})},ex=>{runtimeKeepalivePop();callUserCallback(()=>{var sp=stackSave();var messagePtr=stringToUTF8OnStack(ex.message);_emwgpuOnRequestAdapterCompleted(futureId,4,adapterPtr,messagePtr);stackRestore(sp)})}))}var _emwgpuQueueOnSubmittedWorkDone=function(queuePtr,futureId){futureId=bigintToI53Checked(futureId);var queue=WebGPU.getJsObject(queuePtr);runtimeKeepalivePush();WebGPU.Internals.futureInsert(futureId,queue.onSubmittedWorkDone().then(()=>{runtimeKeepalivePop();callUserCallback(()=>{_emwgpuOnWorkDoneCompleted(futureId,1)})}))};var _emwgpuWaitAny=(futurePtr,futureCount,timeoutMSPtr)=>Asyncify.handleAsync(async()=>{var promises=[];if(timeoutMSPtr){var timeoutMS=(growMemViews(),HEAP32)[timeoutMSPtr>>2];promises.length=futureCount+1;promises[futureCount]=new Promise(resolve=>setTimeout(resolve,timeoutMS,0))}else{promises.length=futureCount}for(var i=0;i<futureCount;++i){var futureId=(growMemViews(),HEAPU32)[futurePtr+i*8+4>>2]*4294967296+(growMemViews(),HEAPU32)[futurePtr+i*8>>2];if(!(futureId in WebGPU.Internals.futures)){return futureId}promises[i]=WebGPU.Internals.futures[futureId]}const firstResolvedFuture=await Promise.race(promises);delete WebGPU.Internals.futures[firstResolvedFuture];return firstResolvedFuture});_emwgpuWaitAny.isAsync=true;var ENV={};var getExecutableName=()=>thisProgram||"./this.program";var getEnvStrings=()=>{if(!getEnvStrings.strings){var lang=(globalThis.navigator?.language??"C").replace("-","_")+".UTF-8";var env={USER:"web_user",LOGNAME:"web_user",PATH:"/",PWD:"/",HOME:"/home/web_user",LANG:lang,_:getExecutableName()};for(var x in ENV){if(ENV[x]===undefined)delete env[x];else env[x]=ENV[x]}var strings=[];for(var x in env){strings.push(`${x}=${env[x]}`)}getEnvStrings.strings=strings}return getEnvStrings.strings};function _environ_get(__environ,environ_buf){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(9,0,1,__environ,environ_buf);var bufSize=0;var envp=0;for(var string of getEnvStrings()){var ptr=environ_buf+bufSize;(growMemViews(),HEAPU32)[__environ+envp>>2]=ptr;bufSize+=stringToUTF8(string,ptr,Infinity)+1;envp+=4}return 0}function _environ_sizes_get(penviron_count,penviron_buf_size){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(10,0,1,penviron_count,penviron_buf_size);var strings=getEnvStrings();(growMemViews(),HEAPU32)[penviron_count>>2]=strings.length;var bufSize=0;for(var string of strings){bufSize+=lengthBytesUTF8(string)+1}(growMemViews(),HEAPU32)[penviron_buf_size>>2]=bufSize;return 0}function _fd_close(fd){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(11,0,1,fd);try{var stream=SYSCALLS.getStreamFromFD(fd);FS.close(stream);return 0}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return e.errno}}var doReadv=(stream,iov,iovcnt,offset)=>{var ret=0;for(var i=0;i<iovcnt;i++){var ptr=(growMemViews(),HEAPU32)[iov>>2];var len=(growMemViews(),HEAPU32)[iov+4>>2];iov+=8;var curr=FS.read(stream,(growMemViews(),HEAP8),ptr,len,offset);if(curr<0)return-1;ret+=curr;if(curr<len)break;if(typeof offset!="undefined"){offset+=curr}}return ret};function _fd_read(fd,iov,iovcnt,pnum){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(12,0,1,fd,iov,iovcnt,pnum);try{var stream=SYSCALLS.getStreamFromFD(fd);var num=doReadv(stream,iov,iovcnt);(growMemViews(),HEAPU32)[pnum>>2]=num;return 0}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return e.errno}}function _fd_seek(fd,offset,whence,newOffset){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(13,0,1,fd,offset,whence,newOffset);offset=bigintToI53Checked(offset);try{if(isNaN(offset))return 61;var stream=SYSCALLS.getStreamFromFD(fd);FS.llseek(stream,offset,whence);(growMemViews(),HEAP64)[newOffset>>3]=BigInt(stream.position);if(stream.getdents&&offset===0&&whence===0)stream.getdents=null;return 0}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return e.errno}}var doWritev=(stream,iov,iovcnt,offset)=>{var ret=0;for(var i=0;i<iovcnt;i++){var ptr=(growMemViews(),HEAPU32)[iov>>2];var len=(growMemViews(),HEAPU32)[iov+4>>2];iov+=8;var curr=FS.write(stream,(growMemViews(),HEAP8),ptr,len,offset);if(curr<0)return-1;ret+=curr;if(curr<len){break}if(typeof offset!="undefined"){offset+=curr}}return ret};function _fd_write(fd,iov,iovcnt,pnum){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(14,0,1,fd,iov,iovcnt,pnum);try{var stream=SYSCALLS.getStreamFromFD(fd);var num=doWritev(stream,iov,iovcnt);(growMemViews(),HEAPU32)[pnum>>2]=num;return 0}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return e.errno}}var _random_get=(buffer,size)=>randomFill((growMemViews(),HEAPU8).subarray(buffer,buffer+size));var emwgpuStringToInt_FeatureName={"core-features-and-limits":1,"depth-clip-control":2,"depth32float-stencil8":3,"texture-compression-bc":4,"texture-compression-bc-sliced-3d":5,"texture-compression-etc2":6,"texture-compression-astc":7,"texture-compression-astc-sliced-3d":8,"timestamp-query":9,"indirect-first-instance":10,"shader-f16":11,"rg11b10ufloat-renderable":12,"bgra8unorm-storage":13,"float32-filterable":14,"float32-blendable":15,"clip-distances":16,"dual-source-blending":17,subgroups:18,"texture-formats-tier1":19,"texture-formats-tier2":20,"primitive-index":21,"chromium-experimental-unorm16-texture-formats":327692,"chromium-experimental-snorm16-texture-formats":327693,"chromium-experimental-multi-draw-indirect":327732};var _wgpuAdapterGetFeatures=(adapterPtr,supportedFeatures)=>{var adapter=WebGPU.getJsObject(adapterPtr);var featuresPtr=_malloc(adapter.features.size*4);var offset=0;var numFeatures=0;for(const feature of adapter.features){var featureEnumValue=emwgpuStringToInt_FeatureName[feature];if(featureEnumValue>=0){(growMemViews(),HEAP32)[featuresPtr+offset>>2]=featureEnumValue;offset+=4;numFeatures++}}(growMemViews(),HEAPU32)[supportedFeatures+4>>2]=featuresPtr;(growMemViews(),HEAPU32)[supportedFeatures>>2]=numFeatures};var _wgpuAdapterGetInfo=(adapterPtr,info)=>{var adapter=WebGPU.getJsObject(adapterPtr);WebGPU.fillAdapterInfoStruct(adapter.info,info);return 1};var _wgpuAdapterGetLimits=(adapterPtr,limitsOutPtr)=>{var adapter=WebGPU.getJsObject(adapterPtr);WebGPU.fillLimitStruct(adapter.limits,limitsOutPtr);return 1};var _wgpuAdapterHasFeature=(adapterPtr,featureEnumValue)=>{var adapter=WebGPU.getJsObject(adapterPtr);return adapter.features.has(WebGPU.FeatureName[featureEnumValue])};var _wgpuBufferGetSize=function(bufferPtr){var ret=(()=>{var buffer=WebGPU.getJsObject(bufferPtr);return buffer.size})();return BigInt(ret)};var _wgpuCommandEncoderBeginComputePass=(encoderPtr,descriptor)=>{var desc;if(descriptor){assert(descriptor);assert((growMemViews(),HEAPU32)[descriptor>>2]===0);desc={label:WebGPU.makeStringFromOptionalStringView(descriptor+4),timestampWrites:WebGPU.makePassTimestampWrites((growMemViews(),HEAPU32)[descriptor+12>>2])}}var commandEncoder=WebGPU.getJsObject(encoderPtr);var ptr=_emwgpuCreateComputePassEncoder(0);WebGPU.Internals.jsObjectInsert(ptr,commandEncoder.beginComputePass(desc));return ptr};function _wgpuCommandEncoderCopyBufferToBuffer(encoderPtr,srcPtr,srcOffset,dstPtr,dstOffset,size){srcOffset=bigintToI53Checked(srcOffset);dstOffset=bigintToI53Checked(dstOffset);size=bigintToI53Checked(size);var commandEncoder=WebGPU.getJsObject(encoderPtr);var src=WebGPU.getJsObject(srcPtr);var dst=WebGPU.getJsObject(dstPtr);commandEncoder.copyBufferToBuffer(src,srcOffset,dst,dstOffset,size)}var _wgpuCommandEncoderFinish=(encoderPtr,descriptor)=>{var commandEncoder=WebGPU.getJsObject(encoderPtr);var ptr=_emwgpuCreateCommandBuffer(0);WebGPU.Internals.jsObjectInsert(ptr,commandEncoder.finish());return ptr};var _wgpuComputePassEncoderDispatchWorkgroups=(passPtr,x,y,z)=>{assert(x>=0);assert(y>=0);assert(z>=0);var pass=WebGPU.getJsObject(passPtr);pass.dispatchWorkgroups(x,y,z)};var _wgpuComputePassEncoderEnd=passPtr=>{var pass=WebGPU.getJsObject(passPtr);pass.end()};var _wgpuComputePassEncoderSetBindGroup=(passPtr,groupIndex,groupPtr,dynamicOffsetCount,dynamicOffsetsPtr)=>{assert(groupIndex>=0);var pass=WebGPU.getJsObject(passPtr);var group=WebGPU.getJsObject(groupPtr);if(dynamicOffsetCount==0){pass.setBindGroup(groupIndex,group)}else{pass.setBindGroup(groupIndex,group,(growMemViews(),HEAPU32),dynamicOffsetsPtr>>2,dynamicOffsetCount)}};var _wgpuComputePassEncoderSetPipeline=(passPtr,pipelinePtr)=>{var pass=WebGPU.getJsObject(passPtr);var pipeline=WebGPU.getJsObject(pipelinePtr);pass.setPipeline(pipeline)};var _wgpuComputePipelineGetBindGroupLayout=(pipelinePtr,groupIndex)=>{assert(groupIndex>=0);var pipeline=WebGPU.getJsObject(pipelinePtr);var ptr=_emwgpuCreateBindGroupLayout(0);WebGPU.Internals.jsObjectInsert(ptr,pipeline.getBindGroupLayout(groupIndex));return ptr};var readI53FromI64=ptr=>(growMemViews(),HEAPU32)[ptr>>2]+(growMemViews(),HEAP32)[ptr+4>>2]*4294967296;var _wgpuDeviceCreateBindGroup=(devicePtr,descriptor)=>{assert(descriptor);assert((growMemViews(),HEAPU32)[descriptor>>2]===0);function makeEntry(entryPtr){assert(entryPtr);var bufferPtr=(growMemViews(),HEAPU32)[entryPtr+8>>2];var samplerPtr=(growMemViews(),HEAPU32)[entryPtr+32>>2];var textureViewPtr=(growMemViews(),HEAPU32)[entryPtr+36>>2];assert((bufferPtr!==0)+(samplerPtr!==0)+(textureViewPtr!==0)===1);var binding=(growMemViews(),HEAPU32)[entryPtr+4>>2];if(bufferPtr){var size=readI53FromI64(entryPtr+24);if(size==-1)size=undefined;return{binding,resource:{buffer:WebGPU.getJsObject(bufferPtr),offset:(growMemViews(),HEAPU32)[entryPtr+4+16>>2]*4294967296+(growMemViews(),HEAPU32)[entryPtr+16>>2],size}}}else if(samplerPtr){return{binding,resource:WebGPU.getJsObject(samplerPtr)}}else{return{binding,resource:WebGPU.getJsObject(textureViewPtr)}}}function makeEntries(count,entriesPtrs){var entries=[];for(var i=0;i<count;++i){entries.push(makeEntry(entriesPtrs+40*i))}return entries}var desc={label:WebGPU.makeStringFromOptionalStringView(descriptor+4),layout:WebGPU.getJsObject((growMemViews(),HEAPU32)[descriptor+12>>2]),entries:makeEntries((growMemViews(),HEAPU32)[descriptor+16>>2],(growMemViews(),HEAPU32)[descriptor+20>>2])};var device=WebGPU.getJsObject(devicePtr);var ptr=_emwgpuCreateBindGroup(0);WebGPU.Internals.jsObjectInsert(ptr,device.createBindGroup(desc));return ptr};var _wgpuDeviceCreateCommandEncoder=(devicePtr,descriptor)=>{var desc;if(descriptor){assert(descriptor);assert((growMemViews(),HEAPU32)[descriptor>>2]===0);desc={label:WebGPU.makeStringFromOptionalStringView(descriptor+4)}}var device=WebGPU.getJsObject(devicePtr);var ptr=_emwgpuCreateCommandEncoder(0);WebGPU.Internals.jsObjectInsert(ptr,device.createCommandEncoder(desc));return ptr};var _wgpuDeviceCreateComputePipeline=(devicePtr,descriptor)=>{var desc=WebGPU.makeComputePipelineDesc(descriptor);var device=WebGPU.getJsObject(devicePtr);var ptr=_emwgpuCreateComputePipeline(0);WebGPU.Internals.jsObjectInsert(ptr,device.createComputePipeline(desc));return ptr};var _wgpuQueueSubmit=(queuePtr,commandCount,commands)=>{assert(commands%4===0);var queue=WebGPU.getJsObject(queuePtr);var cmds=Array.from((growMemViews(),HEAP32).subarray(commands>>2,commands+commandCount*4>>2),id=>WebGPU.getJsObject(id));queue.submit(cmds)};function _wgpuQueueWriteBuffer(queuePtr,bufferPtr,bufferOffset,data,size){bufferOffset=bigintToI53Checked(bufferOffset);var queue=WebGPU.getJsObject(queuePtr);var buffer=WebGPU.getJsObject(bufferPtr);var subarray=(growMemViews(),HEAPU8).subarray(data,data+size);queue.writeBuffer(buffer,bufferOffset,subarray,0,size)}var runAndAbortIfError=func=>{try{return func()}catch(e){abort(e)}};var createNamedFunction=(name,func)=>Object.defineProperty(func,"name",{value:name});var Asyncify={instrumentWasmImports(imports){var importPattern=/^(invoke_.*|__asyncjs__.*)$/;for(let[x,original]of Object.entries(imports)){if(typeof original=="function"){let isAsyncifyImport=original.isAsync||importPattern.test(x);imports[x]=(...args)=>{var originalAsyncifyState=Asyncify.state;try{return original(...args)}finally{var changedToDisabled=originalAsyncifyState===Asyncify.State.Normal&&Asyncify.state===Asyncify.State.Disabled;var ignoredInvoke=x.startsWith("invoke_")&&true;if(Asyncify.state!==originalAsyncifyState&&!isAsyncifyImport&&!changedToDisabled&&!ignoredInvoke){abort(`import ${x} was not in ASYNCIFY_IMPORTS, but changed the state`)}}}}}},instrumentFunction(original){var wrapper=(...args)=>{Asyncify.exportCallStack.push(original);try{return original(...args)}finally{if(!ABORT){var top=Asyncify.exportCallStack.pop();assert(top===original);Asyncify.maybeStopUnwind()}}};Asyncify.funcWrappers.set(original,wrapper);wrapper=createNamedFunction(`__asyncify_wrapper_${original.name}`,wrapper);return wrapper},instrumentWasmExports(exports){var ret={};for(let[x,original]of Object.entries(exports)){if(typeof original=="function"){var wrapper=Asyncify.instrumentFunction(original);ret[x]=wrapper}else{ret[x]=original}}return ret},State:{Normal:0,Unwinding:1,Rewinding:2,Disabled:3},state:0,StackSize:4096,currData:null,handleSleepReturnValue:0,exportCallStack:[],callstackFuncToId:new Map,callStackIdToFunc:new Map,funcWrappers:new Map,callStackId:0,asyncPromiseHandlers:null,sleepCallbacks:[],getCallStackId(func){assert(func);if(!Asyncify.callstackFuncToId.has(func)){var id=Asyncify.callStackId++;Asyncify.callstackFuncToId.set(func,id);Asyncify.callStackIdToFunc.set(id,func)}return Asyncify.callstackFuncToId.get(func)},maybeStopUnwind(){if(Asyncify.currData&&Asyncify.state===Asyncify.State.Unwinding&&Asyncify.exportCallStack.length===0){Asyncify.state=Asyncify.State.Normal;runtimeKeepalivePush();runAndAbortIfError(_asyncify_stop_unwind);if(typeof Fibers!="undefined"){Fibers.trampoline()}}},whenDone(){assert(Asyncify.currData,"Tried to wait for an async operation when none is in progress.");assert(!Asyncify.asyncPromiseHandlers,"Cannot have multiple async operations in flight at once");return new Promise((resolve,reject)=>{Asyncify.asyncPromiseHandlers={resolve,reject}})},allocateData(){var ptr=_malloc(12+Asyncify.StackSize);Asyncify.setDataHeader(ptr,ptr+12,Asyncify.StackSize);Asyncify.setDataRewindFunc(ptr);return ptr},setDataHeader(ptr,stack,stackSize){(growMemViews(),HEAPU32)[ptr>>2]=stack;(growMemViews(),HEAPU32)[ptr+4>>2]=stack+stackSize},setDataRewindFunc(ptr){var bottomOfCallStack=Asyncify.exportCallStack[0];assert(bottomOfCallStack,"exportCallStack is empty");var rewindId=Asyncify.getCallStackId(bottomOfCallStack);(growMemViews(),HEAP32)[ptr+8>>2]=rewindId},getDataRewindFunc(ptr){var id=(growMemViews(),HEAP32)[ptr+8>>2];var func=Asyncify.callStackIdToFunc.get(id);assert(func,`id ${id} not found in callStackIdToFunc`);return func},doRewind(ptr){var original=Asyncify.getDataRewindFunc(ptr);var func=Asyncify.funcWrappers.get(original);assert(original);assert(func);runtimeKeepalivePop();return callUserCallback(func)},handleSleep(startAsync){assert(Asyncify.state!==Asyncify.State.Disabled,"Asyncify cannot be done during or after the runtime exits");if(ABORT)return;if(Asyncify.state===Asyncify.State.Normal){var reachedCallback=false;var reachedAfterCallback=false;startAsync((handleSleepReturnValue=0)=>{assert(["undefined","number","boolean","bigint"].includes(typeof handleSleepReturnValue),`invalid type for handleSleepReturnValue: \'${typeof handleSleepReturnValue}\'`);if(ABORT)return;Asyncify.handleSleepReturnValue=handleSleepReturnValue;reachedCallback=true;if(!reachedAfterCallback){return}assert(!Asyncify.exportCallStack.length,"Waking up (starting to rewind) must be done from JS, without compiled code on the stack.");Asyncify.state=Asyncify.State.Rewinding;runAndAbortIfError(()=>_asyncify_start_rewind(Asyncify.currData));if(typeof MainLoop!="undefined"&&MainLoop.func){MainLoop.resume()}var asyncWasmReturnValue,isError=false;try{asyncWasmReturnValue=Asyncify.doRewind(Asyncify.currData)}catch(err){asyncWasmReturnValue=err;isError=true}var handled=false;if(!Asyncify.currData){var asyncPromiseHandlers=Asyncify.asyncPromiseHandlers;if(asyncPromiseHandlers){Asyncify.asyncPromiseHandlers=null;(isError?asyncPromiseHandlers.reject:asyncPromiseHandlers.resolve)(asyncWasmReturnValue);handled=true}}if(isError&&!handled){throw asyncWasmReturnValue}});reachedAfterCallback=true;if(!reachedCallback){Asyncify.state=Asyncify.State.Unwinding;Asyncify.currData=Asyncify.allocateData();if(typeof MainLoop!="undefined"&&MainLoop.func){MainLoop.pause()}runAndAbortIfError(()=>_asyncify_start_unwind(Asyncify.currData))}}else if(Asyncify.state===Asyncify.State.Rewinding){Asyncify.state=Asyncify.State.Normal;runAndAbortIfError(_asyncify_stop_rewind);_free(Asyncify.currData);Asyncify.currData=null;Asyncify.sleepCallbacks.forEach(callUserCallback)}else{abort(`invalid state: ${Asyncify.state}`)}return Asyncify.handleSleepReturnValue},handleAsync:startAsync=>Asyncify.handleSleep(async wakeUp=>{wakeUp(await startAsync())})};var getCFunc=ident=>{var func=Module["_"+ident];assert(func,`Cannot call unknown function ${ident}, make sure it is exported`);return func};var writeArrayToMemory=(array,buffer)=>{assert(array.length>=0,"writeArrayToMemory array must have a length (should be an array or typed array)");(growMemViews(),HEAP8).set(array,buffer)};var ccall=(ident,returnType,argTypes,args,opts)=>{var toC={string:str=>{var ret=0;if(str!==null&&str!==undefined&&str!==0){ret=stringToUTF8OnStack(str)}return ret},array:arr=>{var ret=stackAlloc(arr.length);writeArrayToMemory(arr,ret);return ret}};function convertReturnValue(ret){if(returnType==="string"){return UTF8ToString(ret)}if(returnType==="boolean")return Boolean(ret);return ret}var func=getCFunc(ident);var cArgs=[];var stack=0;assert(returnType!=="array",\'Return type should not be "array".\');if(args){for(var i=0;i<args.length;i++){var converter=toC[argTypes[i]];if(converter){if(stack===0)stack=stackSave();cArgs[i]=converter(args[i])}else{cArgs[i]=args[i]}}}var previousAsync=Asyncify.currData;var ret=func(...cArgs);function onDone(ret){runtimeKeepalivePop();if(stack!==0)stackRestore(stack);return convertReturnValue(ret)}var asyncMode=opts?.async;runtimeKeepalivePush();if(Asyncify.currData!=previousAsync){assert(!(previousAsync&&Asyncify.currData),"We cannot start an async operation when one is already in flight");assert(!(previousAsync&&!Asyncify.currData),"We cannot stop an async operation in flight");assert(asyncMode,`The call to ${ident} is running asynchronously. If this was intended, add the async option to the ccall/cwrap call.`);return Asyncify.whenDone().then(onDone)}ret=onDone(ret);if(asyncMode)return Promise.resolve(ret);return ret};var cwrap=(ident,returnType,argTypes,opts)=>(...args)=>ccall(ident,returnType,argTypes,args,opts);var FS_createPath=(...args)=>FS.createPath(...args);var FS_unlink=(...args)=>FS.unlink(...args);var FS_createLazyFile=(...args)=>FS.createLazyFile(...args);var FS_createDevice=(...args)=>FS.createDevice(...args);PThread.init();FS.createPreloadedFile=FS_createPreloadedFile;FS.preloadFile=FS_preloadFile;FS.staticInit();{initMemory();if(Module["noExitRuntime"])noExitRuntime=Module["noExitRuntime"];if(Module["preloadPlugins"])preloadPlugins=Module["preloadPlugins"];if(Module["print"])out=Module["print"];if(Module["printErr"])err=Module["printErr"];if(Module["wasmBinary"])wasmBinary=Module["wasmBinary"];checkIncomingModuleAPI();if(Module["arguments"])arguments_=Module["arguments"];if(Module["thisProgram"])thisProgram=Module["thisProgram"];assert(typeof Module["memoryInitializerPrefixURL"]=="undefined","Module.memoryInitializerPrefixURL option was removed, use Module.locateFile instead");assert(typeof Module["pthreadMainPrefixURL"]=="undefined","Module.pthreadMainPrefixURL option was removed, use Module.locateFile instead");assert(typeof Module["cdInitializerPrefixURL"]=="undefined","Module.cdInitializerPrefixURL option was removed, use Module.locateFile instead");assert(typeof Module["filePackagePrefixURL"]=="undefined","Module.filePackagePrefixURL option was removed, use Module.locateFile instead");assert(typeof Module["read"]=="undefined","Module.read option was removed");assert(typeof Module["readAsync"]=="undefined","Module.readAsync option was removed (modify readAsync in JS)");assert(typeof Module["readBinary"]=="undefined","Module.readBinary option was removed (modify readBinary in JS)");assert(typeof Module["setWindowTitle"]=="undefined","Module.setWindowTitle option was removed (modify emscripten_set_window_title in JS)");assert(typeof Module["TOTAL_MEMORY"]=="undefined","Module.TOTAL_MEMORY has been renamed Module.INITIAL_MEMORY");assert(typeof Module["ENVIRONMENT"]=="undefined","Module.ENVIRONMENT has been deprecated. To force the environment, use the ENVIRONMENT compile-time option (for example, -sENVIRONMENT=web or -sENVIRONMENT=node)");assert(typeof Module["STACK_SIZE"]=="undefined","STACK_SIZE can no longer be set at runtime.  Use -sSTACK_SIZE at link time");if(Module["preInit"]){if(typeof Module["preInit"]=="function")Module["preInit"]=[Module["preInit"]];while(Module["preInit"].length>0){Module["preInit"].shift()()}}consumedModuleProp("preInit")}Module["addRunDependency"]=addRunDependency;Module["removeRunDependency"]=removeRunDependency;Module["ccall"]=ccall;Module["cwrap"]=cwrap;Module["FS_preloadFile"]=FS_preloadFile;Module["FS_unlink"]=FS_unlink;Module["FS_createPath"]=FS_createPath;Module["FS_createDevice"]=FS_createDevice;Module["FS_createDataFile"]=FS_createDataFile;Module["FS_createLazyFile"]=FS_createLazyFile;Module["ExitStatus"]=ExitStatus;Module["HEAP16"]=(growMemViews(),HEAP16);Module["HEAP32"]=(growMemViews(),HEAP32);Module["HEAP64"]=(growMemViews(),HEAP64);Module["HEAP8"]=(growMemViews(),HEAP8);Module["HEAPF32"]=(growMemViews(),HEAPF32);Module["HEAPF64"]=(growMemViews(),HEAPF64);Module["HEAPU16"]=(growMemViews(),HEAPU16);Module["HEAPU32"]=(growMemViews(),HEAPU32);Module["HEAPU64"]=(growMemViews(),HEAPU64);Module["HEAPU8"]=(growMemViews(),HEAPU8);Module["PThread"]=PThread;Module["terminateWorker"]=terminateWorker;Module["cleanupThread"]=cleanupThread;Module["addOnPreRun"]=addOnPreRun;Module["onPreRuns"]=onPreRuns;Module["callRuntimeCallbacks"]=callRuntimeCallbacks;Module["spawnThread"]=spawnThread;Module["_exit"]=_exit;Module["exitJS"]=exitJS;Module["_proc_exit"]=_proc_exit;Module["keepRuntimeAlive"]=keepRuntimeAlive;Module["runtimeKeepaliveCounter"]=runtimeKeepaliveCounter;Module["proxyToMainThread"]=proxyToMainThread;Module["stackSave"]=stackSave;Module["stackRestore"]=stackRestore;Module["stackAlloc"]=stackAlloc;Module["exitOnMainThread"]=exitOnMainThread;Module["ptrToString"]=ptrToString;Module["addOnPostRun"]=addOnPostRun;Module["onPostRuns"]=onPostRuns;Module["addRunDependency"]=addRunDependency;Module["runDependencies"]=runDependencies;Module["removeRunDependency"]=removeRunDependency;Module["dependenciesFulfilled"]=dependenciesFulfilled;Module["runDependencyTracking"]=runDependencyTracking;Module["runDependencyWatcher"]=runDependencyWatcher;Module["dynCall"]=dynCall;Module["dynCallLegacy"]=dynCallLegacy;Module["dynCalls"]=dynCalls;Module["establishStackSpace"]=establishStackSpace;Module["getValue"]=getValue;Module["invokeEntryPoint"]=invokeEntryPoint;Module["noExitRuntime"]=noExitRuntime;Module["registerTLSInit"]=registerTLSInit;Module["setValue"]=setValue;Module["warnOnce"]=warnOnce;Module["wasmMemory"]=wasmMemory;Module["___assert_fail"]=___assert_fail;Module["UTF8ToString"]=UTF8ToString;Module["UTF8ArrayToString"]=UTF8ArrayToString;Module["UTF8Decoder"]=UTF8Decoder;Module["findStringEnd"]=findStringEnd;Module["___cxa_throw"]=___cxa_throw;Module["ExceptionInfo"]=ExceptionInfo;Module["uncaughtExceptionCount"]=uncaughtExceptionCount;Module["___pthread_create_js"]=___pthread_create_js;Module["pthreadCreateProxied"]=pthreadCreateProxied;Module["_emscripten_has_threading_support"]=_emscripten_has_threading_support;Module["___syscall_fcntl64"]=___syscall_fcntl64;Module["syscallGetVarargP"]=syscallGetVarargP;Module["syscallGetVarargI"]=syscallGetVarargI;Module["SYSCALLS"]=SYSCALLS;Module["PATH"]=PATH;Module["FS"]=FS;Module["randomFill"]=randomFill;Module["initRandomFill"]=initRandomFill;Module["PATH_FS"]=PATH_FS;Module["TTY"]=TTY;Module["FS_stdin_getChar"]=FS_stdin_getChar;Module["FS_stdin_getChar_buffer"]=FS_stdin_getChar_buffer;Module["intArrayFromString"]=intArrayFromString;Module["lengthBytesUTF8"]=lengthBytesUTF8;Module["stringToUTF8Array"]=stringToUTF8Array;Module["MEMFS"]=MEMFS;Module["mmapAlloc"]=mmapAlloc;Module["zeroMemory"]=zeroMemory;Module["alignMemory"]=alignMemory;Module["FS_modeStringToFlags"]=FS_modeStringToFlags;Module["FS_fileDataToTypedArray"]=FS_fileDataToTypedArray;Module["FS_getMode"]=FS_getMode;Module["strError"]=strError;Module["ERRNO_CODES"]=ERRNO_CODES;Module["FS_createPreloadedFile"]=FS_createPreloadedFile;Module["FS_preloadFile"]=FS_preloadFile;Module["asyncLoad"]=asyncLoad;Module["FS_createDataFile"]=FS_createDataFile;Module["getUniqueRunDependency"]=getUniqueRunDependency;Module["FS_handledByPreloadPlugin"]=FS_handledByPreloadPlugin;Module["preloadPlugins"]=preloadPlugins;Module["___syscall_ioctl"]=___syscall_ioctl;Module["___syscall_openat"]=___syscall_openat;Module["__abort_js"]=__abort_js;Module["__emscripten_init_main_thread_js"]=__emscripten_init_main_thread_js;Module["__emscripten_notify_mailbox_postmessage"]=__emscripten_notify_mailbox_postmessage;Module["checkMailbox"]=checkMailbox;Module["callUserCallback"]=callUserCallback;Module["handleException"]=handleException;Module["maybeExit"]=maybeExit;Module["__emscripten_thread_mailbox_await"]=__emscripten_thread_mailbox_await;Module["waitAsyncPolyfilled"]=waitAsyncPolyfilled;Module["__emscripten_receive_on_main_thread_js"]=__emscripten_receive_on_main_thread_js;Module["proxiedJSCallArgs"]=proxiedJSCallArgs;Module["__emscripten_runtime_keepalive_clear"]=__emscripten_runtime_keepalive_clear;Module["__emscripten_thread_cleanup"]=__emscripten_thread_cleanup;Module["__emscripten_thread_set_strongref"]=__emscripten_thread_set_strongref;Module["__mmap_js"]=__mmap_js;Module["bigintToI53Checked"]=bigintToI53Checked;Module["INT53_MAX"]=INT53_MAX;Module["INT53_MIN"]=INT53_MIN;Module["__munmap_js"]=__munmap_js;Module["__setitimer_js"]=__setitimer_js;Module["timers"]=timers;Module["_emscripten_get_now"]=_emscripten_get_now;Module["__tzset_js"]=__tzset_js;Module["stringToUTF8"]=stringToUTF8;Module["_clock_time_get"]=_clock_time_get;Module["_emscripten_date_now"]=_emscripten_date_now;Module["nowIsMonotonic"]=nowIsMonotonic;Module["checkWasiClock"]=checkWasiClock;Module["_emscripten_check_blocking_allowed"]=_emscripten_check_blocking_allowed;Module["_emscripten_err"]=_emscripten_err;Module["_emscripten_exit_with_live_runtime"]=_emscripten_exit_with_live_runtime;Module["runtimeKeepalivePush"]=runtimeKeepalivePush;Module["_emscripten_get_heap_max"]=_emscripten_get_heap_max;Module["getHeapMax"]=getHeapMax;Module["_emscripten_has_asyncify"]=_emscripten_has_asyncify;Module["_emscripten_num_logical_cores"]=_emscripten_num_logical_cores;Module["_emscripten_resize_heap"]=_emscripten_resize_heap;Module["growMemory"]=growMemory;Module["_emwgpuAdapterRequestDevice"]=_emwgpuAdapterRequestDevice;Module["emwgpuStringToInt_DeviceLostReason"]=emwgpuStringToInt_DeviceLostReason;Module["WebGPU"]=WebGPU;Module["stringToUTF8OnStack"]=stringToUTF8OnStack;Module["stringToNewUTF8"]=stringToNewUTF8;Module["runtimeKeepalivePop"]=runtimeKeepalivePop;Module["_emwgpuBufferDestroy"]=_emwgpuBufferDestroy;Module["_emwgpuBufferGetConstMappedRange"]=_emwgpuBufferGetConstMappedRange;Module["_emwgpuBufferGetMappedRange"]=_emwgpuBufferGetMappedRange;Module["_emwgpuBufferMapAsync"]=_emwgpuBufferMapAsync;Module["_emwgpuBufferUnmap"]=_emwgpuBufferUnmap;Module["_emwgpuDelete"]=_emwgpuDelete;Module["_emwgpuDeviceCreateBuffer"]=_emwgpuDeviceCreateBuffer;Module["_emwgpuDeviceCreateShaderModule"]=_emwgpuDeviceCreateShaderModule;Module["_emwgpuDeviceDestroy"]=_emwgpuDeviceDestroy;Module["_emwgpuInstanceRequestAdapter"]=_emwgpuInstanceRequestAdapter;Module["_emwgpuQueueOnSubmittedWorkDone"]=_emwgpuQueueOnSubmittedWorkDone;Module["_emwgpuWaitAny"]=_emwgpuWaitAny;Module["_environ_get"]=_environ_get;Module["getEnvStrings"]=getEnvStrings;Module["ENV"]=ENV;Module["getExecutableName"]=getExecutableName;Module["_environ_sizes_get"]=_environ_sizes_get;Module["_fd_close"]=_fd_close;Module["_fd_read"]=_fd_read;Module["doReadv"]=doReadv;Module["_fd_seek"]=_fd_seek;Module["_fd_write"]=_fd_write;Module["doWritev"]=doWritev;Module["_random_get"]=_random_get;Module["_wgpuAdapterGetFeatures"]=_wgpuAdapterGetFeatures;Module["emwgpuStringToInt_FeatureName"]=emwgpuStringToInt_FeatureName;Module["_wgpuAdapterGetInfo"]=_wgpuAdapterGetInfo;Module["_wgpuAdapterGetLimits"]=_wgpuAdapterGetLimits;Module["_wgpuAdapterHasFeature"]=_wgpuAdapterHasFeature;Module["_wgpuBufferGetSize"]=_wgpuBufferGetSize;Module["_wgpuCommandEncoderBeginComputePass"]=_wgpuCommandEncoderBeginComputePass;Module["_wgpuCommandEncoderCopyBufferToBuffer"]=_wgpuCommandEncoderCopyBufferToBuffer;Module["_wgpuCommandEncoderFinish"]=_wgpuCommandEncoderFinish;Module["_wgpuComputePassEncoderDispatchWorkgroups"]=_wgpuComputePassEncoderDispatchWorkgroups;Module["_wgpuComputePassEncoderEnd"]=_wgpuComputePassEncoderEnd;Module["_wgpuComputePassEncoderSetBindGroup"]=_wgpuComputePassEncoderSetBindGroup;Module["_wgpuComputePassEncoderSetPipeline"]=_wgpuComputePassEncoderSetPipeline;Module["_wgpuComputePipelineGetBindGroupLayout"]=_wgpuComputePipelineGetBindGroupLayout;Module["_wgpuDeviceCreateBindGroup"]=_wgpuDeviceCreateBindGroup;Module["readI53FromI64"]=readI53FromI64;Module["_wgpuDeviceCreateCommandEncoder"]=_wgpuDeviceCreateCommandEncoder;Module["_wgpuDeviceCreateComputePipeline"]=_wgpuDeviceCreateComputePipeline;Module["_wgpuQueueSubmit"]=_wgpuQueueSubmit;Module["_wgpuQueueWriteBuffer"]=_wgpuQueueWriteBuffer;Module["Asyncify"]=Asyncify;Module["runAndAbortIfError"]=runAndAbortIfError;Module["createNamedFunction"]=createNamedFunction;Module["ccall"]=ccall;Module["getCFunc"]=getCFunc;Module["writeArrayToMemory"]=writeArrayToMemory;Module["cwrap"]=cwrap;Module["FS_createPath"]=FS_createPath;Module["FS_unlink"]=FS_unlink;Module["FS_createLazyFile"]=FS_createLazyFile;Module["FS_createDevice"]=FS_createDevice;var proxiedFunctionTable=[_proc_exit,exitOnMainThread,pthreadCreateProxied,___syscall_fcntl64,___syscall_ioctl,___syscall_openat,__mmap_js,__munmap_js,__setitimer_js,_environ_get,_environ_sizes_get,_fd_close,_fd_read,_fd_seek,_fd_write];function checkIncomingModuleAPI(){ignoredModuleProp("fetchSettings");ignoredModuleProp("logReadFiles");ignoredModuleProp("loadSplitModule");ignoredModuleProp("onMalloc");ignoredModuleProp("onRealloc");ignoredModuleProp("onFree");ignoredModuleProp("onSbrkGrow")}var _wllama_malloc=Module["_wllama_malloc"]=makeInvalidEarlyAccess("_wllama_malloc");var _wllama_start=Module["_wllama_start"]=makeInvalidEarlyAccess("_wllama_start");var _wllama_action=Module["_wllama_action"]=makeInvalidEarlyAccess("_wllama_action");var _wllama_exit=Module["_wllama_exit"]=makeInvalidEarlyAccess("_wllama_exit");var _wllama_debug=Module["_wllama_debug"]=makeInvalidEarlyAccess("_wllama_debug");var _main=Module["_main"]=makeInvalidEarlyAccess("_main");var _fflush=Module["_fflush"]=makeInvalidEarlyAccess("_fflush");var _malloc=Module["_malloc"]=makeInvalidEarlyAccess("_malloc");var _free=Module["_free"]=makeInvalidEarlyAccess("_free");var _strerror=Module["_strerror"]=makeInvalidEarlyAccess("_strerror");var _emwgpuCreateBindGroup=Module["_emwgpuCreateBindGroup"]=makeInvalidEarlyAccess("_emwgpuCreateBindGroup");var _emwgpuCreateBindGroupLayout=Module["_emwgpuCreateBindGroupLayout"]=makeInvalidEarlyAccess("_emwgpuCreateBindGroupLayout");var _emwgpuCreateCommandBuffer=Module["_emwgpuCreateCommandBuffer"]=makeInvalidEarlyAccess("_emwgpuCreateCommandBuffer");var _emwgpuCreateCommandEncoder=Module["_emwgpuCreateCommandEncoder"]=makeInvalidEarlyAccess("_emwgpuCreateCommandEncoder");var _emwgpuCreateComputePassEncoder=Module["_emwgpuCreateComputePassEncoder"]=makeInvalidEarlyAccess("_emwgpuCreateComputePassEncoder");var _emwgpuCreateComputePipeline=Module["_emwgpuCreateComputePipeline"]=makeInvalidEarlyAccess("_emwgpuCreateComputePipeline");var _emwgpuCreatePipelineLayout=Module["_emwgpuCreatePipelineLayout"]=makeInvalidEarlyAccess("_emwgpuCreatePipelineLayout");var _emwgpuCreateQuerySet=Module["_emwgpuCreateQuerySet"]=makeInvalidEarlyAccess("_emwgpuCreateQuerySet");var _emwgpuCreateRenderBundle=Module["_emwgpuCreateRenderBundle"]=makeInvalidEarlyAccess("_emwgpuCreateRenderBundle");var _emwgpuCreateRenderBundleEncoder=Module["_emwgpuCreateRenderBundleEncoder"]=makeInvalidEarlyAccess("_emwgpuCreateRenderBundleEncoder");var _emwgpuCreateRenderPassEncoder=Module["_emwgpuCreateRenderPassEncoder"]=makeInvalidEarlyAccess("_emwgpuCreateRenderPassEncoder");var _emwgpuCreateRenderPipeline=Module["_emwgpuCreateRenderPipeline"]=makeInvalidEarlyAccess("_emwgpuCreateRenderPipeline");var _emwgpuCreateSampler=Module["_emwgpuCreateSampler"]=makeInvalidEarlyAccess("_emwgpuCreateSampler");var _emwgpuCreateSurface=Module["_emwgpuCreateSurface"]=makeInvalidEarlyAccess("_emwgpuCreateSurface");var _emwgpuCreateTexture=Module["_emwgpuCreateTexture"]=makeInvalidEarlyAccess("_emwgpuCreateTexture");var _emwgpuCreateTextureView=Module["_emwgpuCreateTextureView"]=makeInvalidEarlyAccess("_emwgpuCreateTextureView");var _emwgpuCreateAdapter=Module["_emwgpuCreateAdapter"]=makeInvalidEarlyAccess("_emwgpuCreateAdapter");var _emwgpuCreateBuffer=Module["_emwgpuCreateBuffer"]=makeInvalidEarlyAccess("_emwgpuCreateBuffer");var _emwgpuCreateDevice=Module["_emwgpuCreateDevice"]=makeInvalidEarlyAccess("_emwgpuCreateDevice");var _emwgpuCreateQueue=Module["_emwgpuCreateQueue"]=makeInvalidEarlyAccess("_emwgpuCreateQueue");var _emwgpuCreateShaderModule=Module["_emwgpuCreateShaderModule"]=makeInvalidEarlyAccess("_emwgpuCreateShaderModule");var _emwgpuOnDeviceLostCompleted=Module["_emwgpuOnDeviceLostCompleted"]=makeInvalidEarlyAccess("_emwgpuOnDeviceLostCompleted");var _emwgpuOnMapAsyncCompleted=Module["_emwgpuOnMapAsyncCompleted"]=makeInvalidEarlyAccess("_emwgpuOnMapAsyncCompleted");var _emwgpuOnRequestAdapterCompleted=Module["_emwgpuOnRequestAdapterCompleted"]=makeInvalidEarlyAccess("_emwgpuOnRequestAdapterCompleted");var _emwgpuOnRequestDeviceCompleted=Module["_emwgpuOnRequestDeviceCompleted"]=makeInvalidEarlyAccess("_emwgpuOnRequestDeviceCompleted");var _emwgpuOnWorkDoneCompleted=Module["_emwgpuOnWorkDoneCompleted"]=makeInvalidEarlyAccess("_emwgpuOnWorkDoneCompleted");var _emwgpuOnUncapturedError=Module["_emwgpuOnUncapturedError"]=makeInvalidEarlyAccess("_emwgpuOnUncapturedError");var __emscripten_tls_init=Module["__emscripten_tls_init"]=makeInvalidEarlyAccess("__emscripten_tls_init");var _pthread_self=Module["_pthread_self"]=makeInvalidEarlyAccess("_pthread_self");var _emscripten_builtin_memalign=Module["_emscripten_builtin_memalign"]=makeInvalidEarlyAccess("_emscripten_builtin_memalign");var __emscripten_thread_init=Module["__emscripten_thread_init"]=makeInvalidEarlyAccess("__emscripten_thread_init");var __emscripten_thread_crashed=Module["__emscripten_thread_crashed"]=makeInvalidEarlyAccess("__emscripten_thread_crashed");var _emscripten_stack_get_end=Module["_emscripten_stack_get_end"]=makeInvalidEarlyAccess("_emscripten_stack_get_end");var _emscripten_stack_get_base=Module["_emscripten_stack_get_base"]=makeInvalidEarlyAccess("_emscripten_stack_get_base");var __emscripten_run_js_on_main_thread_done=Module["__emscripten_run_js_on_main_thread_done"]=makeInvalidEarlyAccess("__emscripten_run_js_on_main_thread_done");var __emscripten_run_js_on_main_thread=Module["__emscripten_run_js_on_main_thread"]=makeInvalidEarlyAccess("__emscripten_run_js_on_main_thread");var __emscripten_thread_free_data=Module["__emscripten_thread_free_data"]=makeInvalidEarlyAccess("__emscripten_thread_free_data");var __emscripten_thread_exit=Module["__emscripten_thread_exit"]=makeInvalidEarlyAccess("__emscripten_thread_exit");var __emscripten_timeout=Module["__emscripten_timeout"]=makeInvalidEarlyAccess("__emscripten_timeout");var __emscripten_check_mailbox=Module["__emscripten_check_mailbox"]=makeInvalidEarlyAccess("__emscripten_check_mailbox");var _memalign=Module["_memalign"]=makeInvalidEarlyAccess("_memalign");var _emscripten_stack_init=Module["_emscripten_stack_init"]=makeInvalidEarlyAccess("_emscripten_stack_init");var _emscripten_stack_set_limits=Module["_emscripten_stack_set_limits"]=makeInvalidEarlyAccess("_emscripten_stack_set_limits");var _emscripten_stack_get_free=Module["_emscripten_stack_get_free"]=makeInvalidEarlyAccess("_emscripten_stack_get_free");var __emscripten_stack_restore=Module["__emscripten_stack_restore"]=makeInvalidEarlyAccess("__emscripten_stack_restore");var __emscripten_stack_alloc=Module["__emscripten_stack_alloc"]=makeInvalidEarlyAccess("__emscripten_stack_alloc");var _emscripten_stack_get_current=Module["_emscripten_stack_get_current"]=makeInvalidEarlyAccess("_emscripten_stack_get_current");var dynCall_ii=Module["dynCall_ii"]=makeInvalidEarlyAccess("dynCall_ii");var dynCall_ifi=Module["dynCall_ifi"]=makeInvalidEarlyAccess("dynCall_ifi");var dynCall_viii=Module["dynCall_viii"]=makeInvalidEarlyAccess("dynCall_viii");var dynCall_iiii=Module["dynCall_iiii"]=makeInvalidEarlyAccess("dynCall_iiii");var dynCall_vi=Module["dynCall_vi"]=makeInvalidEarlyAccess("dynCall_vi");var dynCall_viiii=Module["dynCall_viiii"]=makeInvalidEarlyAccess("dynCall_viiii");var dynCall_iii=Module["dynCall_iii"]=makeInvalidEarlyAccess("dynCall_iii");var dynCall_viiiii=Module["dynCall_viiiii"]=makeInvalidEarlyAccess("dynCall_viiiii");var dynCall_vii=Module["dynCall_vii"]=makeInvalidEarlyAccess("dynCall_vii");var dynCall_i=Module["dynCall_i"]=makeInvalidEarlyAccess("dynCall_i");var dynCall_jiji=Module["dynCall_jiji"]=makeInvalidEarlyAccess("dynCall_jiji");var dynCall_iidiiii=Module["dynCall_iidiiii"]=makeInvalidEarlyAccess("dynCall_iidiiii");var dynCall_v=Module["dynCall_v"]=makeInvalidEarlyAccess("dynCall_v");var dynCall_iiiii=Module["dynCall_iiiii"]=makeInvalidEarlyAccess("dynCall_iiiii");var dynCall_iiiiiiiii=Module["dynCall_iiiiiiiii"]=makeInvalidEarlyAccess("dynCall_iiiiiiiii");var dynCall_iiiiii=Module["dynCall_iiiiii"]=makeInvalidEarlyAccess("dynCall_iiiiii");var dynCall_viij=Module["dynCall_viij"]=makeInvalidEarlyAccess("dynCall_viij");var dynCall_viiiiiiii=Module["dynCall_viiiiiiii"]=makeInvalidEarlyAccess("dynCall_viiiiiiii");var dynCall_viji=Module["dynCall_viji"]=makeInvalidEarlyAccess("dynCall_viji");var dynCall_viijii=Module["dynCall_viijii"]=makeInvalidEarlyAccess("dynCall_viijii");var dynCall_iiiiiii=Module["dynCall_iiiiiii"]=makeInvalidEarlyAccess("dynCall_iiiiiii");var dynCall_iiiiij=Module["dynCall_iiiiij"]=makeInvalidEarlyAccess("dynCall_iiiiij");var dynCall_iiiiid=Module["dynCall_iiiiid"]=makeInvalidEarlyAccess("dynCall_iiiiid");var dynCall_iiiiijj=Module["dynCall_iiiiijj"]=makeInvalidEarlyAccess("dynCall_iiiiijj");var dynCall_iiiiiiii=Module["dynCall_iiiiiiii"]=makeInvalidEarlyAccess("dynCall_iiiiiiii");var dynCall_iiiiiijj=Module["dynCall_iiiiiijj"]=makeInvalidEarlyAccess("dynCall_iiiiiijj");var dynCall_viiiiii=Module["dynCall_viiiiii"]=makeInvalidEarlyAccess("dynCall_viiiiii");var _asyncify_start_unwind=Module["_asyncify_start_unwind"]=makeInvalidEarlyAccess("_asyncify_start_unwind");var _asyncify_stop_unwind=Module["_asyncify_stop_unwind"]=makeInvalidEarlyAccess("_asyncify_stop_unwind");var _asyncify_start_rewind=Module["_asyncify_start_rewind"]=makeInvalidEarlyAccess("_asyncify_start_rewind");var _asyncify_stop_rewind=Module["_asyncify_stop_rewind"]=makeInvalidEarlyAccess("_asyncify_stop_rewind");var __indirect_function_table=Module["__indirect_function_table"]=makeInvalidEarlyAccess("__indirect_function_table");function assignWasmExports(wasmExports){assert(typeof wasmExports["wllama_malloc"]!="undefined","missing Wasm export: wllama_malloc");assert(typeof wasmExports["wllama_start"]!="undefined","missing Wasm export: wllama_start");assert(typeof wasmExports["wllama_action"]!="undefined","missing Wasm export: wllama_action");assert(typeof wasmExports["wllama_exit"]!="undefined","missing Wasm export: wllama_exit");assert(typeof wasmExports["wllama_debug"]!="undefined","missing Wasm export: wllama_debug");assert(typeof wasmExports["main"]!="undefined","missing Wasm export: main");assert(typeof wasmExports["fflush"]!="undefined","missing Wasm export: fflush");assert(typeof wasmExports["malloc"]!="undefined","missing Wasm export: malloc");assert(typeof wasmExports["free"]!="undefined","missing Wasm export: free");assert(typeof wasmExports["strerror"]!="undefined","missing Wasm export: strerror");assert(typeof wasmExports["emwgpuCreateBindGroup"]!="undefined","missing Wasm export: emwgpuCreateBindGroup");assert(typeof wasmExports["emwgpuCreateBindGroupLayout"]!="undefined","missing Wasm export: emwgpuCreateBindGroupLayout");assert(typeof wasmExports["emwgpuCreateCommandBuffer"]!="undefined","missing Wasm export: emwgpuCreateCommandBuffer");assert(typeof wasmExports["emwgpuCreateCommandEncoder"]!="undefined","missing Wasm export: emwgpuCreateCommandEncoder");assert(typeof wasmExports["emwgpuCreateComputePassEncoder"]!="undefined","missing Wasm export: emwgpuCreateComputePassEncoder");assert(typeof wasmExports["emwgpuCreateComputePipeline"]!="undefined","missing Wasm export: emwgpuCreateComputePipeline");assert(typeof wasmExports["emwgpuCreatePipelineLayout"]!="undefined","missing Wasm export: emwgpuCreatePipelineLayout");assert(typeof wasmExports["emwgpuCreateQuerySet"]!="undefined","missing Wasm export: emwgpuCreateQuerySet");assert(typeof wasmExports["emwgpuCreateRenderBundle"]!="undefined","missing Wasm export: emwgpuCreateRenderBundle");assert(typeof wasmExports["emwgpuCreateRenderBundleEncoder"]!="undefined","missing Wasm export: emwgpuCreateRenderBundleEncoder");assert(typeof wasmExports["emwgpuCreateRenderPassEncoder"]!="undefined","missing Wasm export: emwgpuCreateRenderPassEncoder");assert(typeof wasmExports["emwgpuCreateRenderPipeline"]!="undefined","missing Wasm export: emwgpuCreateRenderPipeline");assert(typeof wasmExports["emwgpuCreateSampler"]!="undefined","missing Wasm export: emwgpuCreateSampler");assert(typeof wasmExports["emwgpuCreateSurface"]!="undefined","missing Wasm export: emwgpuCreateSurface");assert(typeof wasmExports["emwgpuCreateTexture"]!="undefined","missing Wasm export: emwgpuCreateTexture");assert(typeof wasmExports["emwgpuCreateTextureView"]!="undefined","missing Wasm export: emwgpuCreateTextureView");assert(typeof wasmExports["emwgpuCreateAdapter"]!="undefined","missing Wasm export: emwgpuCreateAdapter");assert(typeof wasmExports["emwgpuCreateBuffer"]!="undefined","missing Wasm export: emwgpuCreateBuffer");assert(typeof wasmExports["emwgpuCreateDevice"]!="undefined","missing Wasm export: emwgpuCreateDevice");assert(typeof wasmExports["emwgpuCreateQueue"]!="undefined","missing Wasm export: emwgpuCreateQueue");assert(typeof wasmExports["emwgpuCreateShaderModule"]!="undefined","missing Wasm export: emwgpuCreateShaderModule");assert(typeof wasmExports["emwgpuOnDeviceLostCompleted"]!="undefined","missing Wasm export: emwgpuOnDeviceLostCompleted");assert(typeof wasmExports["emwgpuOnMapAsyncCompleted"]!="undefined","missing Wasm export: emwgpuOnMapAsyncCompleted");assert(typeof wasmExports["emwgpuOnRequestAdapterCompleted"]!="undefined","missing Wasm export: emwgpuOnRequestAdapterCompleted");assert(typeof wasmExports["emwgpuOnRequestDeviceCompleted"]!="undefined","missing Wasm export: emwgpuOnRequestDeviceCompleted");assert(typeof wasmExports["emwgpuOnWorkDoneCompleted"]!="undefined","missing Wasm export: emwgpuOnWorkDoneCompleted");assert(typeof wasmExports["emwgpuOnUncapturedError"]!="undefined","missing Wasm export: emwgpuOnUncapturedError");assert(typeof wasmExports["_emscripten_tls_init"]!="undefined","missing Wasm export: _emscripten_tls_init");assert(typeof wasmExports["pthread_self"]!="undefined","missing Wasm export: pthread_self");assert(typeof wasmExports["emscripten_builtin_memalign"]!="undefined","missing Wasm export: emscripten_builtin_memalign");assert(typeof wasmExports["_emscripten_thread_init"]!="undefined","missing Wasm export: _emscripten_thread_init");assert(typeof wasmExports["_emscripten_thread_crashed"]!="undefined","missing Wasm export: _emscripten_thread_crashed");assert(typeof wasmExports["emscripten_stack_get_end"]!="undefined","missing Wasm export: emscripten_stack_get_end");assert(typeof wasmExports["emscripten_stack_get_base"]!="undefined","missing Wasm export: emscripten_stack_get_base");assert(typeof wasmExports["_emscripten_run_js_on_main_thread_done"]!="undefined","missing Wasm export: _emscripten_run_js_on_main_thread_done");assert(typeof wasmExports["_emscripten_run_js_on_main_thread"]!="undefined","missing Wasm export: _emscripten_run_js_on_main_thread");assert(typeof wasmExports["_emscripten_thread_free_data"]!="undefined","missing Wasm export: _emscripten_thread_free_data");assert(typeof wasmExports["_emscripten_thread_exit"]!="undefined","missing Wasm export: _emscripten_thread_exit");assert(typeof wasmExports["_emscripten_timeout"]!="undefined","missing Wasm export: _emscripten_timeout");assert(typeof wasmExports["_emscripten_check_mailbox"]!="undefined","missing Wasm export: _emscripten_check_mailbox");assert(typeof wasmExports["memalign"]!="undefined","missing Wasm export: memalign");assert(typeof wasmExports["emscripten_stack_init"]!="undefined","missing Wasm export: emscripten_stack_init");assert(typeof wasmExports["emscripten_stack_set_limits"]!="undefined","missing Wasm export: emscripten_stack_set_limits");assert(typeof wasmExports["emscripten_stack_get_free"]!="undefined","missing Wasm export: emscripten_stack_get_free");assert(typeof wasmExports["_emscripten_stack_restore"]!="undefined","missing Wasm export: _emscripten_stack_restore");assert(typeof wasmExports["_emscripten_stack_alloc"]!="undefined","missing Wasm export: _emscripten_stack_alloc");assert(typeof wasmExports["emscripten_stack_get_current"]!="undefined","missing Wasm export: emscripten_stack_get_current");assert(typeof wasmExports["dynCall_ii"]!="undefined","missing Wasm export: dynCall_ii");assert(typeof wasmExports["dynCall_ifi"]!="undefined","missing Wasm export: dynCall_ifi");assert(typeof wasmExports["dynCall_viii"]!="undefined","missing Wasm export: dynCall_viii");assert(typeof wasmExports["dynCall_iiii"]!="undefined","missing Wasm export: dynCall_iiii");assert(typeof wasmExports["dynCall_vi"]!="undefined","missing Wasm export: dynCall_vi");assert(typeof wasmExports["dynCall_viiii"]!="undefined","missing Wasm export: dynCall_viiii");assert(typeof wasmExports["dynCall_iii"]!="undefined","missing Wasm export: dynCall_iii");assert(typeof wasmExports["dynCall_viiiii"]!="undefined","missing Wasm export: dynCall_viiiii");assert(typeof wasmExports["dynCall_vii"]!="undefined","missing Wasm export: dynCall_vii");assert(typeof wasmExports["dynCall_i"]!="undefined","missing Wasm export: dynCall_i");assert(typeof wasmExports["dynCall_jiji"]!="undefined","missing Wasm export: dynCall_jiji");assert(typeof wasmExports["dynCall_iidiiii"]!="undefined","missing Wasm export: dynCall_iidiiii");assert(typeof wasmExports["dynCall_v"]!="undefined","missing Wasm export: dynCall_v");assert(typeof wasmExports["dynCall_iiiii"]!="undefined","missing Wasm export: dynCall_iiiii");assert(typeof wasmExports["dynCall_iiiiiiiii"]!="undefined","missing Wasm export: dynCall_iiiiiiiii");assert(typeof wasmExports["dynCall_iiiiii"]!="undefined","missing Wasm export: dynCall_iiiiii");assert(typeof wasmExports["dynCall_viij"]!="undefined","missing Wasm export: dynCall_viij");assert(typeof wasmExports["dynCall_viiiiiiii"]!="undefined","missing Wasm export: dynCall_viiiiiiii");assert(typeof wasmExports["dynCall_viji"]!="undefined","missing Wasm export: dynCall_viji");assert(typeof wasmExports["dynCall_viijii"]!="undefined","missing Wasm export: dynCall_viijii");assert(typeof wasmExports["dynCall_iiiiiii"]!="undefined","missing Wasm export: dynCall_iiiiiii");assert(typeof wasmExports["dynCall_iiiiij"]!="undefined","missing Wasm export: dynCall_iiiiij");assert(typeof wasmExports["dynCall_iiiiid"]!="undefined","missing Wasm export: dynCall_iiiiid");assert(typeof wasmExports["dynCall_iiiiijj"]!="undefined","missing Wasm export: dynCall_iiiiijj");assert(typeof wasmExports["dynCall_iiiiiiii"]!="undefined","missing Wasm export: dynCall_iiiiiiii");assert(typeof wasmExports["dynCall_iiiiiijj"]!="undefined","missing Wasm export: dynCall_iiiiiijj");assert(typeof wasmExports["dynCall_viiiiii"]!="undefined","missing Wasm export: dynCall_viiiiii");assert(typeof wasmExports["asyncify_start_unwind"]!="undefined","missing Wasm export: asyncify_start_unwind");assert(typeof wasmExports["asyncify_stop_unwind"]!="undefined","missing Wasm export: asyncify_stop_unwind");assert(typeof wasmExports["asyncify_start_rewind"]!="undefined","missing Wasm export: asyncify_start_rewind");assert(typeof wasmExports["asyncify_stop_rewind"]!="undefined","missing Wasm export: asyncify_stop_rewind");assert(typeof wasmExports["__indirect_function_table"]!="undefined","missing Wasm export: __indirect_function_table");_wllama_malloc=Module["_wllama_malloc"]=createExportWrapper("wllama_malloc",2);_wllama_start=Module["_wllama_start"]=createExportWrapper("wllama_start",0);_wllama_action=Module["_wllama_action"]=createExportWrapper("wllama_action",2);_wllama_exit=Module["_wllama_exit"]=createExportWrapper("wllama_exit",0);_wllama_debug=Module["_wllama_debug"]=createExportWrapper("wllama_debug",0);_main=Module["_main"]=createExportWrapper("main",2);_fflush=Module["_fflush"]=createExportWrapper("fflush",1);_malloc=Module["_malloc"]=createExportWrapper("malloc",1);_free=Module["_free"]=createExportWrapper("free",1);_strerror=Module["_strerror"]=createExportWrapper("strerror",1);_emwgpuCreateBindGroup=Module["_emwgpuCreateBindGroup"]=createExportWrapper("emwgpuCreateBindGroup",1);_emwgpuCreateBindGroupLayout=Module["_emwgpuCreateBindGroupLayout"]=createExportWrapper("emwgpuCreateBindGroupLayout",1);_emwgpuCreateCommandBuffer=Module["_emwgpuCreateCommandBuffer"]=createExportWrapper("emwgpuCreateCommandBuffer",1);_emwgpuCreateCommandEncoder=Module["_emwgpuCreateCommandEncoder"]=createExportWrapper("emwgpuCreateCommandEncoder",1);_emwgpuCreateComputePassEncoder=Module["_emwgpuCreateComputePassEncoder"]=createExportWrapper("emwgpuCreateComputePassEncoder",1);_emwgpuCreateComputePipeline=Module["_emwgpuCreateComputePipeline"]=createExportWrapper("emwgpuCreateComputePipeline",1);_emwgpuCreatePipelineLayout=Module["_emwgpuCreatePipelineLayout"]=createExportWrapper("emwgpuCreatePipelineLayout",1);_emwgpuCreateQuerySet=Module["_emwgpuCreateQuerySet"]=createExportWrapper("emwgpuCreateQuerySet",1);_emwgpuCreateRenderBundle=Module["_emwgpuCreateRenderBundle"]=createExportWrapper("emwgpuCreateRenderBundle",1);_emwgpuCreateRenderBundleEncoder=Module["_emwgpuCreateRenderBundleEncoder"]=createExportWrapper("emwgpuCreateRenderBundleEncoder",1);_emwgpuCreateRenderPassEncoder=Module["_emwgpuCreateRenderPassEncoder"]=createExportWrapper("emwgpuCreateRenderPassEncoder",1);_emwgpuCreateRenderPipeline=Module["_emwgpuCreateRenderPipeline"]=createExportWrapper("emwgpuCreateRenderPipeline",1);_emwgpuCreateSampler=Module["_emwgpuCreateSampler"]=createExportWrapper("emwgpuCreateSampler",1);_emwgpuCreateSurface=Module["_emwgpuCreateSurface"]=createExportWrapper("emwgpuCreateSurface",1);_emwgpuCreateTexture=Module["_emwgpuCreateTexture"]=createExportWrapper("emwgpuCreateTexture",1);_emwgpuCreateTextureView=Module["_emwgpuCreateTextureView"]=createExportWrapper("emwgpuCreateTextureView",1);_emwgpuCreateAdapter=Module["_emwgpuCreateAdapter"]=createExportWrapper("emwgpuCreateAdapter",1);_emwgpuCreateBuffer=Module["_emwgpuCreateBuffer"]=createExportWrapper("emwgpuCreateBuffer",2);_emwgpuCreateDevice=Module["_emwgpuCreateDevice"]=createExportWrapper("emwgpuCreateDevice",2);_emwgpuCreateQueue=Module["_emwgpuCreateQueue"]=createExportWrapper("emwgpuCreateQueue",1);_emwgpuCreateShaderModule=Module["_emwgpuCreateShaderModule"]=createExportWrapper("emwgpuCreateShaderModule",1);_emwgpuOnDeviceLostCompleted=Module["_emwgpuOnDeviceLostCompleted"]=createExportWrapper("emwgpuOnDeviceLostCompleted",3);_emwgpuOnMapAsyncCompleted=Module["_emwgpuOnMapAsyncCompleted"]=createExportWrapper("emwgpuOnMapAsyncCompleted",3);_emwgpuOnRequestAdapterCompleted=Module["_emwgpuOnRequestAdapterCompleted"]=createExportWrapper("emwgpuOnRequestAdapterCompleted",4);_emwgpuOnRequestDeviceCompleted=Module["_emwgpuOnRequestDeviceCompleted"]=createExportWrapper("emwgpuOnRequestDeviceCompleted",4);_emwgpuOnWorkDoneCompleted=Module["_emwgpuOnWorkDoneCompleted"]=createExportWrapper("emwgpuOnWorkDoneCompleted",2);_emwgpuOnUncapturedError=Module["_emwgpuOnUncapturedError"]=createExportWrapper("emwgpuOnUncapturedError",3);__emscripten_tls_init=Module["__emscripten_tls_init"]=createExportWrapper("_emscripten_tls_init",0);_pthread_self=Module["_pthread_self"]=createExportWrapper("pthread_self",0);_emscripten_builtin_memalign=Module["_emscripten_builtin_memalign"]=createExportWrapper("emscripten_builtin_memalign",2);__emscripten_thread_init=Module["__emscripten_thread_init"]=createExportWrapper("_emscripten_thread_init",6);__emscripten_thread_crashed=Module["__emscripten_thread_crashed"]=createExportWrapper("_emscripten_thread_crashed",0);_emscripten_stack_get_end=Module["_emscripten_stack_get_end"]=wasmExports["emscripten_stack_get_end"];_emscripten_stack_get_base=Module["_emscripten_stack_get_base"]=wasmExports["emscripten_stack_get_base"];__emscripten_run_js_on_main_thread_done=Module["__emscripten_run_js_on_main_thread_done"]=createExportWrapper("_emscripten_run_js_on_main_thread_done",3);__emscripten_run_js_on_main_thread=Module["__emscripten_run_js_on_main_thread"]=createExportWrapper("_emscripten_run_js_on_main_thread",5);__emscripten_thread_free_data=Module["__emscripten_thread_free_data"]=createExportWrapper("_emscripten_thread_free_data",1);__emscripten_thread_exit=Module["__emscripten_thread_exit"]=createExportWrapper("_emscripten_thread_exit",1);__emscripten_timeout=Module["__emscripten_timeout"]=createExportWrapper("_emscripten_timeout",2);__emscripten_check_mailbox=Module["__emscripten_check_mailbox"]=createExportWrapper("_emscripten_check_mailbox",0);_memalign=Module["_memalign"]=createExportWrapper("memalign",2);_emscripten_stack_init=Module["_emscripten_stack_init"]=wasmExports["emscripten_stack_init"];_emscripten_stack_set_limits=Module["_emscripten_stack_set_limits"]=wasmExports["emscripten_stack_set_limits"];_emscripten_stack_get_free=Module["_emscripten_stack_get_free"]=wasmExports["emscripten_stack_get_free"];__emscripten_stack_restore=Module["__emscripten_stack_restore"]=wasmExports["_emscripten_stack_restore"];__emscripten_stack_alloc=Module["__emscripten_stack_alloc"]=wasmExports["_emscripten_stack_alloc"];_emscripten_stack_get_current=Module["_emscripten_stack_get_current"]=wasmExports["emscripten_stack_get_current"];dynCall_ii=dynCalls["ii"]=Module["dynCall_ii"]=createExportWrapper("dynCall_ii",2);dynCall_ifi=dynCalls["ifi"]=Module["dynCall_ifi"]=createExportWrapper("dynCall_ifi",3);dynCall_viii=dynCalls["viii"]=Module["dynCall_viii"]=createExportWrapper("dynCall_viii",4);dynCall_iiii=dynCalls["iiii"]=Module["dynCall_iiii"]=createExportWrapper("dynCall_iiii",4);dynCall_vi=dynCalls["vi"]=Module["dynCall_vi"]=createExportWrapper("dynCall_vi",2);dynCall_viiii=dynCalls["viiii"]=Module["dynCall_viiii"]=createExportWrapper("dynCall_viiii",5);dynCall_iii=dynCalls["iii"]=Module["dynCall_iii"]=createExportWrapper("dynCall_iii",3);dynCall_viiiii=dynCalls["viiiii"]=Module["dynCall_viiiii"]=createExportWrapper("dynCall_viiiii",6);dynCall_vii=dynCalls["vii"]=Module["dynCall_vii"]=createExportWrapper("dynCall_vii",3);dynCall_i=dynCalls["i"]=Module["dynCall_i"]=createExportWrapper("dynCall_i",1);dynCall_jiji=dynCalls["jiji"]=Module["dynCall_jiji"]=createExportWrapper("dynCall_jiji",4);dynCall_iidiiii=dynCalls["iidiiii"]=Module["dynCall_iidiiii"]=createExportWrapper("dynCall_iidiiii",7);dynCall_v=dynCalls["v"]=Module["dynCall_v"]=createExportWrapper("dynCall_v",1);dynCall_iiiii=dynCalls["iiiii"]=Module["dynCall_iiiii"]=createExportWrapper("dynCall_iiiii",5);dynCall_iiiiiiiii=dynCalls["iiiiiiiii"]=Module["dynCall_iiiiiiiii"]=createExportWrapper("dynCall_iiiiiiiii",9);dynCall_iiiiii=dynCalls["iiiiii"]=Module["dynCall_iiiiii"]=createExportWrapper("dynCall_iiiiii",6);dynCall_viij=dynCalls["viij"]=Module["dynCall_viij"]=createExportWrapper("dynCall_viij",4);dynCall_viiiiiiii=dynCalls["viiiiiiii"]=Module["dynCall_viiiiiiii"]=createExportWrapper("dynCall_viiiiiiii",9);dynCall_viji=dynCalls["viji"]=Module["dynCall_viji"]=createExportWrapper("dynCall_viji",4);dynCall_viijii=dynCalls["viijii"]=Module["dynCall_viijii"]=createExportWrapper("dynCall_viijii",6);dynCall_iiiiiii=dynCalls["iiiiiii"]=Module["dynCall_iiiiiii"]=createExportWrapper("dynCall_iiiiiii",7);dynCall_iiiiij=dynCalls["iiiiij"]=Module["dynCall_iiiiij"]=createExportWrapper("dynCall_iiiiij",6);dynCall_iiiiid=dynCalls["iiiiid"]=Module["dynCall_iiiiid"]=createExportWrapper("dynCall_iiiiid",6);dynCall_iiiiijj=dynCalls["iiiiijj"]=Module["dynCall_iiiiijj"]=createExportWrapper("dynCall_iiiiijj",7);dynCall_iiiiiiii=dynCalls["iiiiiiii"]=Module["dynCall_iiiiiiii"]=createExportWrapper("dynCall_iiiiiiii",8);dynCall_iiiiiijj=dynCalls["iiiiiijj"]=Module["dynCall_iiiiiijj"]=createExportWrapper("dynCall_iiiiiijj",8);dynCall_viiiiii=dynCalls["viiiiii"]=Module["dynCall_viiiiii"]=createExportWrapper("dynCall_viiiiii",7);_asyncify_start_unwind=Module["_asyncify_start_unwind"]=createExportWrapper("asyncify_start_unwind",1);_asyncify_stop_unwind=Module["_asyncify_stop_unwind"]=createExportWrapper("asyncify_stop_unwind",0);_asyncify_start_rewind=Module["_asyncify_start_rewind"]=createExportWrapper("asyncify_start_rewind",1);_asyncify_stop_rewind=Module["_asyncify_stop_rewind"]=createExportWrapper("asyncify_stop_rewind",0);__indirect_function_table=Module["__indirect_function_table"]=wasmExports["__indirect_function_table"]}var wasmImports;function assignWasmImports(){wasmImports={__assert_fail:___assert_fail,__cxa_throw:___cxa_throw,__pthread_create_js:___pthread_create_js,__syscall_fcntl64:___syscall_fcntl64,__syscall_ioctl:___syscall_ioctl,__syscall_openat:___syscall_openat,_abort_js:__abort_js,_emscripten_init_main_thread_js:__emscripten_init_main_thread_js,_emscripten_notify_mailbox_postmessage:__emscripten_notify_mailbox_postmessage,_emscripten_receive_on_main_thread_js:__emscripten_receive_on_main_thread_js,_emscripten_runtime_keepalive_clear:__emscripten_runtime_keepalive_clear,_emscripten_thread_cleanup:__emscripten_thread_cleanup,_emscripten_thread_mailbox_await:__emscripten_thread_mailbox_await,_emscripten_thread_set_strongref:__emscripten_thread_set_strongref,_mmap_js:__mmap_js,_munmap_js:__munmap_js,_setitimer_js:__setitimer_js,_tzset_js:__tzset_js,clock_time_get:_clock_time_get,emscripten_check_blocking_allowed:_emscripten_check_blocking_allowed,emscripten_date_now:_emscripten_date_now,emscripten_err:_emscripten_err,emscripten_exit_with_live_runtime:_emscripten_exit_with_live_runtime,emscripten_get_heap_max:_emscripten_get_heap_max,emscripten_get_now:_emscripten_get_now,emscripten_has_asyncify:_emscripten_has_asyncify,emscripten_num_logical_cores:_emscripten_num_logical_cores,emscripten_resize_heap:_emscripten_resize_heap,emwgpuAdapterRequestDevice:_emwgpuAdapterRequestDevice,emwgpuBufferDestroy:_emwgpuBufferDestroy,emwgpuBufferGetConstMappedRange:_emwgpuBufferGetConstMappedRange,emwgpuBufferGetMappedRange:_emwgpuBufferGetMappedRange,emwgpuBufferMapAsync:_emwgpuBufferMapAsync,emwgpuBufferUnmap:_emwgpuBufferUnmap,emwgpuDelete:_emwgpuDelete,emwgpuDeviceCreateBuffer:_emwgpuDeviceCreateBuffer,emwgpuDeviceCreateShaderModule:_emwgpuDeviceCreateShaderModule,emwgpuDeviceDestroy:_emwgpuDeviceDestroy,emwgpuInstanceRequestAdapter:_emwgpuInstanceRequestAdapter,emwgpuQueueOnSubmittedWorkDone:_emwgpuQueueOnSubmittedWorkDone,emwgpuWaitAny:_emwgpuWaitAny,environ_get:_environ_get,environ_sizes_get:_environ_sizes_get,exit:_exit,fd_close:_fd_close,fd_read:_fd_read,fd_seek:_fd_seek,fd_write:_fd_write,memory:wasmMemory,proc_exit:_proc_exit,random_get:_random_get,wgpuAdapterGetFeatures:_wgpuAdapterGetFeatures,wgpuAdapterGetInfo:_wgpuAdapterGetInfo,wgpuAdapterGetLimits:_wgpuAdapterGetLimits,wgpuAdapterHasFeature:_wgpuAdapterHasFeature,wgpuBufferGetSize:_wgpuBufferGetSize,wgpuCommandEncoderBeginComputePass:_wgpuCommandEncoderBeginComputePass,wgpuCommandEncoderCopyBufferToBuffer:_wgpuCommandEncoderCopyBufferToBuffer,wgpuCommandEncoderFinish:_wgpuCommandEncoderFinish,wgpuComputePassEncoderDispatchWorkgroups:_wgpuComputePassEncoderDispatchWorkgroups,wgpuComputePassEncoderEnd:_wgpuComputePassEncoderEnd,wgpuComputePassEncoderSetBindGroup:_wgpuComputePassEncoderSetBindGroup,wgpuComputePassEncoderSetPipeline:_wgpuComputePassEncoderSetPipeline,wgpuComputePipelineGetBindGroupLayout:_wgpuComputePipelineGetBindGroupLayout,wgpuDeviceCreateBindGroup:_wgpuDeviceCreateBindGroup,wgpuDeviceCreateCommandEncoder:_wgpuDeviceCreateCommandEncoder,wgpuDeviceCreateComputePipeline:_wgpuDeviceCreateComputePipeline,wgpuQueueSubmit:_wgpuQueueSubmit,wgpuQueueWriteBuffer:_wgpuQueueWriteBuffer}}var calledRun;function callMain(){assert(runDependencies==0,\'cannot call main when async dependencies remain! (listen on Module["onRuntimeInitialized"])\');assert(typeof onPreRuns==="undefined"||onPreRuns.length==0,"cannot call main when preRun functions remain to be called");var entryFunction=_main;var argc=0;var argv=0;try{var ret=entryFunction(argc,argv);exitJS(ret,true);return ret}catch(e){return handleException(e)}}function stackCheckInit(){assert(!ENVIRONMENT_IS_PTHREAD);_emscripten_stack_init();writeStackCookie()}function run(){if(runDependencies>0){dependenciesFulfilled=run;return}if(ENVIRONMENT_IS_PTHREAD){initRuntime();return}stackCheckInit();preRun();if(runDependencies>0){dependenciesFulfilled=run;return}function doRun(){assert(!calledRun);calledRun=true;Module["calledRun"]=true;if(ABORT)return;initRuntime();preMain();Module["onRuntimeInitialized"]?.();consumedModuleProp("onRuntimeInitialized");var noInitialRun=Module["noInitialRun"]||false;if(!noInitialRun)callMain();postRun()}if(Module["setStatus"]){Module["setStatus"]("Running...");setTimeout(()=>{setTimeout(()=>Module["setStatus"](""),1);doRun()},1)}else{doRun()}checkStackCookie()}function checkUnflushedContent(){var oldOut=out;var oldErr=err;var has=false;out=err=x=>{has=true};try{_fflush(0);for(var name of["stdout","stderr"]){var info=FS.analyzePath("/dev/"+name);if(!info)return;var stream=info.object;var rdev=stream.rdev;var tty=TTY.ttys[rdev];if(tty?.output?.length){has=true}}}catch(e){}out=oldOut;err=oldErr;if(has){warnOnce("stdio streams had content in them that was not flushed. you should set EXIT_RUNTIME to 1 (see the Emscripten FAQ), or make sure to emit a newline when you printf etc.")}}var wasmExports;if(!ENVIRONMENT_IS_PTHREAD){createWasm();run()}\n';
var WLLAMA_SINGLE_THREAD_CODE = '(function(){function humanReadableVersionToPacked(str){str=str.split("-")[0];var vers=str.split(".").slice(0,3);while(vers.length<3)vers.push("00");vers=vers.map((n,i,arr)=>n.padStart(2,"0"));return vers.join("")}var packedVersionToHumanReadable=n=>[n/1e4|0,(n/100|0)%100,n%100].join(".");var TARGET_NOT_SUPPORTED=2147483647;var currentNodeVersion=typeof process!=="undefined"&&process.versions?.node?humanReadableVersionToPacked(process.versions.node):TARGET_NOT_SUPPORTED;if(currentNodeVersion<16e4){throw new Error(`This emscripten-generated code requires node v${packedVersionToHumanReadable(16e4)} (detected v${packedVersionToHumanReadable(currentNodeVersion)})`)}var userAgent=typeof navigator!=="undefined"&&navigator.userAgent;if(!userAgent){return}var currentSafariVersion=userAgent.includes("Safari/")&&!userAgent.includes("Chrome/")&&userAgent.match(/Version\\/(\\d+\\.?\\d*\\.?\\d*)/)?humanReadableVersionToPacked(userAgent.match(/Version\\/(\\d+\\.?\\d*\\.?\\d*)/)[1]):TARGET_NOT_SUPPORTED;if(currentSafariVersion<15e4){throw new Error(`This emscripten-generated code requires Safari v${packedVersionToHumanReadable(15e4)} (detected v${currentSafariVersion})`)}var currentFirefoxVersion=userAgent.match(/Firefox\\/(\\d+(?:\\.\\d+)?)/)?parseFloat(userAgent.match(/Firefox\\/(\\d+(?:\\.\\d+)?)/)[1]):TARGET_NOT_SUPPORTED;if(currentFirefoxVersion<79){throw new Error(`This emscripten-generated code requires Firefox v79 (detected v${currentFirefoxVersion})`)}var currentChromeVersion=userAgent.match(/Chrome\\/(\\d+(?:\\.\\d+)?)/)?parseFloat(userAgent.match(/Chrome\\/(\\d+(?:\\.\\d+)?)/)[1]):TARGET_NOT_SUPPORTED;if(currentChromeVersion<85){throw new Error(`This emscripten-generated code requires Chrome v85 (detected v${currentChromeVersion})`)}})();var Module=typeof Module!="undefined"?Module:{};var ENVIRONMENT_IS_WEB=!!globalThis.window;var ENVIRONMENT_IS_WORKER=!!globalThis.WorkerGlobalScope;var ENVIRONMENT_IS_NODE=globalThis.process?.versions?.node&&globalThis.process?.type!="renderer";var ENVIRONMENT_IS_SHELL=!ENVIRONMENT_IS_WEB&&!ENVIRONMENT_IS_NODE&&!ENVIRONMENT_IS_WORKER;var arguments_=[];var thisProgram="./this.program";var quit_=(status,toThrow)=>{throw toThrow};var _scriptName=globalThis.document?.currentScript?.src;if(typeof __filename!="undefined"){_scriptName=__filename}else if(ENVIRONMENT_IS_WORKER){_scriptName=self.location.href}var scriptDirectory="";function locateFile(path){if(Module["locateFile"]){return Module["locateFile"](path,scriptDirectory)}return scriptDirectory+path}var readAsync,readBinary;if(ENVIRONMENT_IS_NODE){const isNode=globalThis.process?.versions?.node&&globalThis.process?.type!="renderer";if(!isNode)throw new Error("not compiled for this environment (did you build to HTML and try to run it not on the web, or set ENVIRONMENT to something - like node - and run it someplace else - like on the web?)");var fs=require("node:fs");scriptDirectory=__dirname+"/";readBinary=filename=>{filename=isFileURI(filename)?new URL(filename):filename;var ret=fs.readFileSync(filename);assert(Buffer.isBuffer(ret));return ret};readAsync=async(filename,binary=true)=>{filename=isFileURI(filename)?new URL(filename):filename;var ret=fs.readFileSync(filename,binary?undefined:"utf8");assert(binary?Buffer.isBuffer(ret):typeof ret=="string");return ret};if(process.argv.length>1){thisProgram=process.argv[1].replace(/\\\\/g,"/")}arguments_=process.argv.slice(2);if(typeof module!="undefined"){module["exports"]=Module}quit_=(status,toThrow)=>{process.exitCode=status;throw toThrow}}else if(ENVIRONMENT_IS_SHELL){}else if(ENVIRONMENT_IS_WEB||ENVIRONMENT_IS_WORKER){try{scriptDirectory=new URL(".",_scriptName).href}catch{}if(!(globalThis.window||globalThis.WorkerGlobalScope))throw new Error("not compiled for this environment (did you build to HTML and try to run it not on the web, or set ENVIRONMENT to something - like node - and run it someplace else - like on the web?)");{if(ENVIRONMENT_IS_WORKER){readBinary=url=>{var xhr=new XMLHttpRequest;xhr.open("GET",url,false);xhr.responseType="arraybuffer";xhr.send(null);return new Uint8Array(xhr.response)}}readAsync=async url=>{if(isFileURI(url)){return new Promise((resolve,reject)=>{var xhr=new XMLHttpRequest;xhr.open("GET",url,true);xhr.responseType="arraybuffer";xhr.onload=()=>{if(xhr.status==200||xhr.status==0&&xhr.response){resolve(xhr.response);return}reject(xhr.status)};xhr.onerror=reject;xhr.send(null)})}var response=await fetch(url,{credentials:"same-origin"});if(response.ok){return response.arrayBuffer()}throw new Error(response.status+" : "+response.url)}}}else{throw new Error("environment detection error")}var out=console.log.bind(console);var err=console.error.bind(console);assert(!ENVIRONMENT_IS_SHELL,"shell environment detected but not enabled at build time.  Add `shell` to `-sENVIRONMENT` to enable.");var wasmBinary;if(!globalThis.WebAssembly){err("no native wasm support detected")}var ABORT=false;var EXITSTATUS;function assert(condition,text){if(!condition){abort("Assertion failed"+(text?": "+text:""))}}var isFileURI=filename=>filename.startsWith("file://");function writeStackCookie(){var max=_emscripten_stack_get_end();assert((max&3)==0);if(max==0){max+=4}HEAPU32[max>>2]=34821223;HEAPU32[max+4>>2]=2310721022;HEAPU32[0>>2]=1668509029}function checkStackCookie(){if(ABORT)return;var max=_emscripten_stack_get_end();if(max==0){max+=4}var cookie1=HEAPU32[max>>2];var cookie2=HEAPU32[max+4>>2];if(cookie1!=34821223||cookie2!=2310721022){abort(`Stack overflow! Stack cookie has been overwritten at ${ptrToString(max)}, expected hex dwords 0x89BACDFE and 0x2135467, but received ${ptrToString(cookie2)} ${ptrToString(cookie1)}`)}if(HEAPU32[0>>2]!=1668509029){abort("Runtime error: The application has corrupted its heap memory area (address zero)!")}}class EmscriptenEH{}class EmscriptenSjLj extends EmscriptenEH{}var runtimeDebug=true;(()=>{var h16=new Int16Array(1);var h8=new Int8Array(h16.buffer);h16[0]=25459;if(h8[0]!==115||h8[1]!==99)abort("Runtime error: expected the system to be little-endian! (Run with -sSUPPORT_BIG_ENDIAN to bypass)")})();function consumedModuleProp(prop){if(!Object.getOwnPropertyDescriptor(Module,prop)){Object.defineProperty(Module,prop,{configurable:true,set(){abort(`Attempt to set \\`Module.${prop}\\` after it has already been processed.  This can happen, for example, when code is injected via \'--post-js\' rather than \'--pre-js\'`)}})}}function makeInvalidEarlyAccess(name){return()=>assert(false,`call to \'${name}\' via reference taken before Wasm module initialization`)}function ignoredModuleProp(prop){if(Object.getOwnPropertyDescriptor(Module,prop)){abort(`\\`Module.${prop}\\` was supplied but \\`${prop}\\` not included in INCOMING_MODULE_JS_API`)}}function isExportedByForceFilesystem(name){return name==="FS_createPath"||name==="FS_createDataFile"||name==="FS_createPreloadedFile"||name==="FS_preloadFile"||name==="FS_unlink"||name==="addRunDependency"||name==="FS_createLazyFile"||name==="FS_createDevice"||name==="removeRunDependency"}function hookGlobalSymbolAccess(sym,func){if(!Object.getOwnPropertyDescriptor(globalThis,sym)){Object.defineProperty(globalThis,sym,{configurable:true,get(){func();return undefined}})}}function missingGlobal(sym,msg){hookGlobalSymbolAccess(sym,()=>{warnOnce(`\\`${sym}\\` is no longer defined by emscripten. ${msg}`)})}missingGlobal("buffer","Please use HEAP8.buffer or wasmMemory.buffer");missingGlobal("asm","Please use wasmExports instead");function unexportedRuntimeSymbol(sym){if(!Object.getOwnPropertyDescriptor(Module,sym)){Object.defineProperty(Module,sym,{configurable:true,get(){var msg=`\'${sym}\' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the Emscripten FAQ)`;if(isExportedByForceFilesystem(sym)){msg+=". Alternatively, forcing filesystem support (-sFORCE_FILESYSTEM) can export this for you"}abort(msg)}})}}var runtimeInitialized=false;function updateMemoryViews(){var b=wasmMemory.buffer;HEAP8=new Int8Array(b);HEAP16=new Int16Array(b);HEAPU8=new Uint8Array(b);HEAPU16=new Uint16Array(b);HEAP32=new Int32Array(b);HEAPU32=new Uint32Array(b);HEAPF32=new Float32Array(b);HEAPF64=new Float64Array(b);HEAP64=new BigInt64Array(b);HEAPU64=new BigUint64Array(b);Module["HEAP8"]=HEAP8;Module["HEAPU8"]=HEAPU8;Module["HEAP16"]=HEAP16;Module["HEAPU16"]=HEAPU16;Module["HEAP32"]=HEAP32;Module["HEAPU32"]=HEAPU32;Module["HEAPF32"]=HEAPF32;Module["HEAPF64"]=HEAPF64;Module["HEAP64"]=HEAP64;Module["HEAPU64"]=HEAPU64}function initMemory(){if(Module["wasmMemory"]){wasmMemory=Module["wasmMemory"]}else{var INITIAL_MEMORY=Module["INITIAL_MEMORY"]||134217728;assert(INITIAL_MEMORY>=65536,`INITIAL_MEMORY should be larger than STACK_SIZE, was ${INITIAL_MEMORY}! (STACK_SIZE=65536)`);wasmMemory=new WebAssembly.Memory({initial:INITIAL_MEMORY/65536,maximum:32768})}updateMemoryViews()}assert(globalThis.Int32Array&&globalThis.Float64Array&&Int32Array.prototype.subarray&&Int32Array.prototype.set,"JS engine does not provide full typed array support");function preRun(){if(Module["preRun"]){if(typeof Module["preRun"]=="function")Module["preRun"]=[Module["preRun"]];while(Module["preRun"].length){addOnPreRun(Module["preRun"].shift())}}consumedModuleProp("preRun");callRuntimeCallbacks(onPreRuns)}function initRuntime(){assert(!runtimeInitialized);runtimeInitialized=true;checkStackCookie();if(!Module["noFSInit"]&&!FS.initialized)FS.init();TTY.init();wasmExports["__wasm_call_ctors"]();FS.ignorePermissions=false}function preMain(){checkStackCookie()}function postRun(){checkStackCookie();if(Module["postRun"]){if(typeof Module["postRun"]=="function")Module["postRun"]=[Module["postRun"]];while(Module["postRun"].length){addOnPostRun(Module["postRun"].shift())}}consumedModuleProp("postRun");callRuntimeCallbacks(onPostRuns)}function abort(what){Module["onAbort"]?.(what);what=`Aborted(${what})`;err(what);ABORT=true;if(what.search(/RuntimeError: [Uu]nreachable/)>=0){what+=\'. "unreachable" may be due to ASYNCIFY_STACK_SIZE not being large enough (try increasing it)\'}var e=new WebAssembly.RuntimeError(what);throw e}function createExportWrapper(name,nargs){return(...args)=>{assert(runtimeInitialized,`native function \\`${name}\\` called before runtime initialization`);var f=wasmExports[name];assert(f,`exported native function \\`${name}\\` not found`);assert(args.length<=nargs,`native function \\`${name}\\` called with ${args.length} args but expects ${nargs}`);return f(...args)}}var wasmBinaryFile;function findWasmBinary(){return locateFile("wllama.wasm")}function getBinarySync(file){if(file==wasmBinaryFile&&wasmBinary){return new Uint8Array(wasmBinary)}if(readBinary){return readBinary(file)}throw"both async and sync fetching of the wasm failed"}async function getWasmBinary(binaryFile){if(!wasmBinary){try{var response=await readAsync(binaryFile);return new Uint8Array(response)}catch{}}return getBinarySync(binaryFile)}async function instantiateArrayBuffer(binaryFile,imports){try{var binary=await getWasmBinary(binaryFile);var instance=await WebAssembly.instantiate(binary,imports);return instance}catch(reason){err(`failed to asynchronously prepare wasm: ${reason}`);if(isFileURI(binaryFile)){err(`warning: Loading from a file URI (${binaryFile}) is not supported in most browsers. See https://emscripten.org/docs/getting_started/FAQ.html#how-do-i-run-a-local-webserver-for-testing-why-does-my-program-stall-in-downloading-or-preparing`)}abort(reason)}}async function instantiateAsync(binary,binaryFile,imports){if(!binary&&!isFileURI(binaryFile)&&!ENVIRONMENT_IS_NODE){try{var response=fetch(binaryFile,{credentials:"same-origin"});var instantiationResult=await WebAssembly.instantiateStreaming(response,imports);return instantiationResult}catch(reason){err(`wasm streaming compile failed: ${reason}`);err("falling back to ArrayBuffer instantiation")}}return instantiateArrayBuffer(binaryFile,imports)}function getWasmImports(){Asyncify.instrumentWasmImports(wasmImports);var imports={env:wasmImports,wasi_snapshot_preview1:wasmImports};return imports}async function createWasm(){function receiveInstance(instance,module){wasmExports=instance.exports;wasmExports=Asyncify.instrumentWasmExports(wasmExports);assignWasmExports(wasmExports);removeRunDependency("wasm-instantiate");return wasmExports}addRunDependency("wasm-instantiate");var trueModule=Module;function receiveInstantiationResult(result){assert(Module===trueModule,"the Module object should not be replaced during async compilation - perhaps the order of HTML elements is wrong?");trueModule=null;return receiveInstance(result["instance"])}var info=getWasmImports();if(Module["instantiateWasm"]){return new Promise((resolve,reject)=>{try{Module["instantiateWasm"](info,(inst,mod)=>{resolve(receiveInstance(inst,mod))})}catch(e){err(`Module.instantiateWasm callback failed with error: ${e}`);reject(e)}})}wasmBinaryFile??=findWasmBinary();var result=await instantiateAsync(wasmBinary,wasmBinaryFile,info);var exports=receiveInstantiationResult(result);return exports}class ExitStatus{name="ExitStatus";constructor(status){this.message=`Program terminated with exit(${status})`;this.status=status}}var HEAP16;var HEAP32;var HEAP64;var HEAP8;var HEAPF32;var HEAPF64;var HEAPU16;var HEAPU32;var HEAPU64;var HEAPU8;var callRuntimeCallbacks=callbacks=>{while(callbacks.length>0){callbacks.shift()(Module)}};var onPostRuns=[];var addOnPostRun=cb=>onPostRuns.push(cb);var onPreRuns=[];var addOnPreRun=cb=>onPreRuns.push(cb);var runDependencies=0;var dependenciesFulfilled=null;var runDependencyTracking={};var runDependencyWatcher=null;var removeRunDependency=id=>{runDependencies--;Module["monitorRunDependencies"]?.(runDependencies);assert(id,"removeRunDependency requires an ID");assert(runDependencyTracking[id]);delete runDependencyTracking[id];if(runDependencies==0){if(runDependencyWatcher!==null){clearInterval(runDependencyWatcher);runDependencyWatcher=null}if(dependenciesFulfilled){var callback=dependenciesFulfilled;dependenciesFulfilled=null;callback()}}};var addRunDependency=id=>{runDependencies++;Module["monitorRunDependencies"]?.(runDependencies);assert(id,"addRunDependency requires an ID");assert(!runDependencyTracking[id]);runDependencyTracking[id]=1;if(runDependencyWatcher===null&&globalThis.setInterval){runDependencyWatcher=setInterval(()=>{if(ABORT){clearInterval(runDependencyWatcher);runDependencyWatcher=null;return}var shown=false;for(var dep in runDependencyTracking){if(!shown){shown=true;err("still waiting on run dependencies:")}err(`dependency: ${dep}`)}if(shown){err("(end of list)")}},1e4);runDependencyWatcher.unref?.()}};var dynCalls={};var dynCallLegacy=(sig,ptr,args)=>{sig=sig.replace(/p/g,"i");assert(sig in dynCalls,`bad function pointer type - sig is not in dynCalls: \'${sig}\'`);if(args?.length){assert(args.length===sig.length-1)}else{assert(sig.length==1)}var f=dynCalls[sig];return f(ptr,...args)};var dynCall=(sig,ptr,args=[],promising=false)=>{assert(ptr,`null function pointer in dynCall`);assert(!promising,"async dynCall is not supported in this mode");var rtn=dynCallLegacy(sig,ptr,args);function convert(rtn){return rtn}return convert(rtn)};function getValue(ptr,type="i8"){if(type.endsWith("*"))type="*";switch(type){case"i1":return HEAP8[ptr];case"i8":return HEAP8[ptr];case"i16":return HEAP16[ptr>>1];case"i32":return HEAP32[ptr>>2];case"i64":return HEAP64[ptr>>3];case"float":return HEAPF32[ptr>>2];case"double":return HEAPF64[ptr>>3];case"*":return HEAPU32[ptr>>2];default:abort(`invalid type for getValue: ${type}`)}}var noExitRuntime=true;function ptrToString(ptr){assert(typeof ptr==="number",`ptrToString expects a number, got ${typeof ptr}`);ptr>>>=0;return"0x"+ptr.toString(16).padStart(8,"0")}function setValue(ptr,value,type="i8"){if(type.endsWith("*"))type="*";switch(type){case"i1":HEAP8[ptr]=value;break;case"i8":HEAP8[ptr]=value;break;case"i16":HEAP16[ptr>>1]=value;break;case"i32":HEAP32[ptr>>2]=value;break;case"i64":HEAP64[ptr>>3]=BigInt(value);break;case"float":HEAPF32[ptr>>2]=value;break;case"double":HEAPF64[ptr>>3]=value;break;case"*":HEAPU32[ptr>>2]=value;break;default:abort(`invalid type for setValue: ${type}`)}}var stackRestore=val=>__emscripten_stack_restore(val);var stackSave=()=>_emscripten_stack_get_current();var warnOnce=text=>{warnOnce.shown||={};if(!warnOnce.shown[text]){warnOnce.shown[text]=1;if(ENVIRONMENT_IS_NODE)text="warning: "+text;err(text)}};var wasmMemory;var UTF8Decoder=globalThis.TextDecoder&&new TextDecoder;var findStringEnd=(heapOrArray,idx,maxBytesToRead,ignoreNul)=>{var maxIdx=idx+maxBytesToRead;if(ignoreNul)return maxIdx;while(heapOrArray[idx]&&!(idx>=maxIdx))++idx;return idx};var UTF8ArrayToString=(heapOrArray,idx=0,maxBytesToRead,ignoreNul)=>{var endPtr=findStringEnd(heapOrArray,idx,maxBytesToRead,ignoreNul);if(endPtr-idx>16&&heapOrArray.buffer&&UTF8Decoder){return UTF8Decoder.decode(heapOrArray.subarray(idx,endPtr))}var str="";while(idx<endPtr){var u0=heapOrArray[idx++];if(!(u0&128)){str+=String.fromCharCode(u0);continue}var u1=heapOrArray[idx++]&63;if((u0&224)==192){str+=String.fromCharCode((u0&31)<<6|u1);continue}var u2=heapOrArray[idx++]&63;if((u0&240)==224){u0=(u0&15)<<12|u1<<6|u2}else{if((u0&248)!=240)warnOnce(`Invalid UTF-8 leading byte ${ptrToString(u0)} encountered when deserializing a UTF-8 string in wasm memory to a JS string!`);u0=(u0&7)<<18|u1<<12|u2<<6|heapOrArray[idx++]&63}if(u0<65536){str+=String.fromCharCode(u0)}else{var ch=u0-65536;str+=String.fromCharCode(55296|ch>>10,56320|ch&1023)}}return str};var UTF8ToString=(ptr,maxBytesToRead,ignoreNul)=>{assert(typeof ptr=="number",`UTF8ToString expects a number (got ${typeof ptr})`);return ptr?UTF8ArrayToString(HEAPU8,ptr,maxBytesToRead,ignoreNul):""};var ___assert_fail=(condition,filename,line,func)=>abort(`Assertion failed: ${UTF8ToString(condition)}, at: `+[filename?UTF8ToString(filename):"unknown filename",line,func?UTF8ToString(func):"unknown function"]);class ExceptionInfo{constructor(excPtr){this.excPtr=excPtr;this.ptr=excPtr-24}set_type(type){HEAPU32[this.ptr+4>>2]=type}get_type(){return HEAPU32[this.ptr+4>>2]}set_destructor(destructor){HEAPU32[this.ptr+8>>2]=destructor}get_destructor(){return HEAPU32[this.ptr+8>>2]}set_caught(caught){caught=caught?1:0;HEAP8[this.ptr+12]=caught}get_caught(){return HEAP8[this.ptr+12]!=0}set_rethrown(rethrown){rethrown=rethrown?1:0;HEAP8[this.ptr+13]=rethrown}get_rethrown(){return HEAP8[this.ptr+13]!=0}init(type,destructor){this.set_adjusted_ptr(0);this.set_type(type);this.set_destructor(destructor)}set_adjusted_ptr(adjustedPtr){HEAPU32[this.ptr+16>>2]=adjustedPtr}get_adjusted_ptr(){return HEAPU32[this.ptr+16>>2]}}var uncaughtExceptionCount=0;var ___cxa_throw=(ptr,type,destructor)=>{var info=new ExceptionInfo(ptr);info.init(type,destructor);uncaughtExceptionCount++;assert(false,"Exception thrown, but exception catching is not enabled. Compile with -sNO_DISABLE_EXCEPTION_CATCHING or -sEXCEPTION_CATCHING_ALLOWED=[..] to catch.")};var syscallGetVarargI=()=>{assert(SYSCALLS.varargs!=undefined);var ret=HEAP32[+SYSCALLS.varargs>>2];SYSCALLS.varargs+=4;return ret};var syscallGetVarargP=syscallGetVarargI;var PATH={isAbs:path=>path.charAt(0)==="/",splitPath:filename=>{var splitPathRe=/^(\\/?|)([\\s\\S]*?)((?:\\.{1,2}|[^\\/]+?|)(\\.[^.\\/]*|))(?:[\\/]*)$/;return splitPathRe.exec(filename).slice(1)},normalizeArray:(parts,allowAboveRoot)=>{var up=0;for(var i=parts.length-1;i>=0;i--){var last=parts[i];if(last==="."){parts.splice(i,1)}else if(last===".."){parts.splice(i,1);up++}else if(up){parts.splice(i,1);up--}}if(allowAboveRoot){for(;up;up--){parts.unshift("..")}}return parts},normalize:path=>{var isAbsolute=PATH.isAbs(path),trailingSlash=path.slice(-1)==="/";path=PATH.normalizeArray(path.split("/").filter(p=>!!p),!isAbsolute).join("/");if(!path&&!isAbsolute){path="."}if(path&&trailingSlash){path+="/"}return(isAbsolute?"/":"")+path},dirname:path=>{var result=PATH.splitPath(path),root=result[0],dir=result[1];if(!root&&!dir){return"."}if(dir){dir=dir.slice(0,-1)}return root+dir},basename:path=>path&&path.match(/([^\\/]+|\\/)\\/*$/)[1],join:(...paths)=>PATH.normalize(paths.join("/")),join2:(l,r)=>PATH.normalize(l+"/"+r)};var initRandomFill=()=>{if(ENVIRONMENT_IS_NODE){var nodeCrypto=require("node:crypto");return view=>nodeCrypto.randomFillSync(view)}return view=>(crypto.getRandomValues(view),0)};var randomFill=view=>(randomFill=initRandomFill())(view);var PATH_FS={resolve:(...args)=>{var resolvedPath="",resolvedAbsolute=false;for(var i=args.length-1;i>=-1&&!resolvedAbsolute;i--){var path=i>=0?args[i]:FS.cwd();if(typeof path!="string"){throw new TypeError("Arguments to path.resolve must be strings")}else if(!path){return""}resolvedPath=path+"/"+resolvedPath;resolvedAbsolute=PATH.isAbs(path)}resolvedPath=PATH.normalizeArray(resolvedPath.split("/").filter(p=>!!p),!resolvedAbsolute).join("/");return(resolvedAbsolute?"/":"")+resolvedPath||"."},relative:(from,to)=>{from=PATH_FS.resolve(from).slice(1);to=PATH_FS.resolve(to).slice(1);function trim(arr){var start=0;for(;start<arr.length;start++){if(arr[start]!=="")break}var end=arr.length-1;for(;end>=0;end--){if(arr[end]!=="")break}if(start>end)return[];return arr.slice(start,end-start+1)}var fromParts=trim(from.split("/"));var toParts=trim(to.split("/"));var length=Math.min(fromParts.length,toParts.length);var samePartsLength=length;for(var i=0;i<length;i++){if(fromParts[i]!==toParts[i]){samePartsLength=i;break}}var outputParts=[];for(var i=samePartsLength;i<fromParts.length;i++){outputParts.push("..")}outputParts=outputParts.concat(toParts.slice(samePartsLength));return outputParts.join("/")}};var FS_stdin_getChar_buffer=[];var lengthBytesUTF8=str=>{var len=0;for(var i=0;i<str.length;++i){var c=str.charCodeAt(i);if(c<=127){len++}else if(c<=2047){len+=2}else if(c>=55296&&c<=57343){len+=4;++i}else{len+=3}}return len};var stringToUTF8Array=(str,heap,outIdx,maxBytesToWrite)=>{assert(typeof str==="string",`stringToUTF8Array expects a string (got ${typeof str})`);if(!(maxBytesToWrite>0))return 0;var startIdx=outIdx;var endIdx=outIdx+maxBytesToWrite-1;for(var i=0;i<str.length;++i){var u=str.codePointAt(i);if(u<=127){if(outIdx>=endIdx)break;heap[outIdx++]=u}else if(u<=2047){if(outIdx+1>=endIdx)break;heap[outIdx++]=192|u>>6;heap[outIdx++]=128|u&63}else if(u<=65535){if(outIdx+2>=endIdx)break;heap[outIdx++]=224|u>>12;heap[outIdx++]=128|u>>6&63;heap[outIdx++]=128|u&63}else{if(outIdx+3>=endIdx)break;if(u>1114111)warnOnce(`Invalid Unicode code point ${ptrToString(u)} encountered when serializing a JS string to a UTF-8 string in wasm memory! (Valid unicode code points should be in range 0-0x10FFFF).`);heap[outIdx++]=240|u>>18;heap[outIdx++]=128|u>>12&63;heap[outIdx++]=128|u>>6&63;heap[outIdx++]=128|u&63;i++}}heap[outIdx]=0;return outIdx-startIdx};var intArrayFromString=(stringy,dontAddNull,length)=>{var len=length>0?length:lengthBytesUTF8(stringy)+1;var u8array=new Array(len);var numBytesWritten=stringToUTF8Array(stringy,u8array,0,u8array.length);if(dontAddNull)u8array.length=numBytesWritten;return u8array};var FS_stdin_getChar=()=>{if(!FS_stdin_getChar_buffer.length){var result=null;if(ENVIRONMENT_IS_NODE){var BUFSIZE=256;var buf=Buffer.alloc(BUFSIZE);var bytesRead=0;var fd=process.stdin.fd;try{bytesRead=fs.readSync(fd,buf,0,BUFSIZE)}catch(e){if(e.toString().includes("EOF"))bytesRead=0;else throw e}if(bytesRead>0){result=buf.slice(0,bytesRead).toString("utf-8")}}else if(globalThis.window?.prompt){result=window.prompt("Input: ");if(result!==null){result+="\\n"}}else{}if(!result){return null}FS_stdin_getChar_buffer=intArrayFromString(result,true)}return FS_stdin_getChar_buffer.shift()};var TTY={ttys:[],init(){},shutdown(){},register(dev,ops){TTY.ttys[dev]={input:[],output:[],ops};FS.registerDevice(dev,TTY.stream_ops)},stream_ops:{open(stream){var tty=TTY.ttys[stream.node.rdev];if(!tty){throw new FS.ErrnoError(43)}stream.tty=tty;stream.seekable=false},close(stream){stream.tty.ops.fsync(stream.tty)},fsync(stream){stream.tty.ops.fsync(stream.tty)},read(stream,buffer,offset,length,pos){if(!stream.tty||!stream.tty.ops.get_char){throw new FS.ErrnoError(60)}var bytesRead=0;for(var i=0;i<length;i++){var result;try{result=stream.tty.ops.get_char(stream.tty)}catch(e){throw new FS.ErrnoError(29)}if(result===undefined&&bytesRead===0){throw new FS.ErrnoError(6)}if(result===null||result===undefined)break;bytesRead++;buffer[offset+i]=result}if(bytesRead){stream.node.atime=Date.now()}return bytesRead},write(stream,buffer,offset,length,pos){if(!stream.tty||!stream.tty.ops.put_char){throw new FS.ErrnoError(60)}try{for(var i=0;i<length;i++){stream.tty.ops.put_char(stream.tty,buffer[offset+i])}}catch(e){throw new FS.ErrnoError(29)}if(length){stream.node.mtime=stream.node.ctime=Date.now()}return i}},default_tty_ops:{get_char(tty){return FS_stdin_getChar()},put_char(tty,val){if(val===null||val===10){out(UTF8ArrayToString(tty.output));tty.output=[]}else{if(val!=0)tty.output.push(val)}},fsync(tty){if(tty.output?.length>0){out(UTF8ArrayToString(tty.output));tty.output=[]}},ioctl_tcgets(tty){return{c_iflag:25856,c_oflag:5,c_cflag:191,c_lflag:35387,c_cc:[3,28,127,21,4,0,1,0,17,19,26,0,18,15,23,22,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]}},ioctl_tcsets(tty,optional_actions,data){return 0},ioctl_tiocgwinsz(tty){return[24,80]}},default_tty1_ops:{put_char(tty,val){if(val===null||val===10){err(UTF8ArrayToString(tty.output));tty.output=[]}else{if(val!=0)tty.output.push(val)}},fsync(tty){if(tty.output?.length>0){err(UTF8ArrayToString(tty.output));tty.output=[]}}}};var zeroMemory=(ptr,size)=>HEAPU8.fill(0,ptr,ptr+size);var alignMemory=(size,alignment)=>{assert(alignment,"alignment argument is required");return Math.ceil(size/alignment)*alignment};var mmapAlloc=size=>{size=alignMemory(size,65536);var ptr=_emscripten_builtin_memalign(65536,size);if(ptr)zeroMemory(ptr,size);return ptr};var MEMFS={ops_table:null,mount(mount){return MEMFS.createNode(null,"/",16895,0)},createNode(parent,name,mode,dev){if(FS.isBlkdev(mode)||FS.isFIFO(mode)){throw new FS.ErrnoError(63)}MEMFS.ops_table||={dir:{node:{getattr:MEMFS.node_ops.getattr,setattr:MEMFS.node_ops.setattr,lookup:MEMFS.node_ops.lookup,mknod:MEMFS.node_ops.mknod,rename:MEMFS.node_ops.rename,unlink:MEMFS.node_ops.unlink,rmdir:MEMFS.node_ops.rmdir,readdir:MEMFS.node_ops.readdir,symlink:MEMFS.node_ops.symlink},stream:{llseek:MEMFS.stream_ops.llseek}},file:{node:{getattr:MEMFS.node_ops.getattr,setattr:MEMFS.node_ops.setattr},stream:{llseek:MEMFS.stream_ops.llseek,read:MEMFS.stream_ops.read,write:MEMFS.stream_ops.write,mmap:MEMFS.stream_ops.mmap,msync:MEMFS.stream_ops.msync}},link:{node:{getattr:MEMFS.node_ops.getattr,setattr:MEMFS.node_ops.setattr,readlink:MEMFS.node_ops.readlink},stream:{}},chrdev:{node:{getattr:MEMFS.node_ops.getattr,setattr:MEMFS.node_ops.setattr},stream:FS.chrdev_stream_ops}};var node=FS.createNode(parent,name,mode,dev);if(FS.isDir(node.mode)){node.node_ops=MEMFS.ops_table.dir.node;node.stream_ops=MEMFS.ops_table.dir.stream;node.contents={}}else if(FS.isFile(node.mode)){node.node_ops=MEMFS.ops_table.file.node;node.stream_ops=MEMFS.ops_table.file.stream;node.usedBytes=0;node.contents=MEMFS.emptyFileContents??=new Uint8Array(0)}else if(FS.isLink(node.mode)){node.node_ops=MEMFS.ops_table.link.node;node.stream_ops=MEMFS.ops_table.link.stream}else if(FS.isChrdev(node.mode)){node.node_ops=MEMFS.ops_table.chrdev.node;node.stream_ops=MEMFS.ops_table.chrdev.stream}node.atime=node.mtime=node.ctime=Date.now();if(parent){parent.contents[name]=node;parent.atime=parent.mtime=parent.ctime=node.atime}return node},getFileDataAsTypedArray(node){assert(FS.isFile(node.mode),"getFileDataAsTypedArray called on non-file");return node.contents.subarray(0,node.usedBytes)},expandFileStorage(node,newCapacity){var prevCapacity=node.contents.length;if(prevCapacity>=newCapacity)return;var CAPACITY_DOUBLING_MAX=1024*1024;newCapacity=Math.max(newCapacity,prevCapacity*(prevCapacity<CAPACITY_DOUBLING_MAX?2:1.125)>>>0);if(prevCapacity)newCapacity=Math.max(newCapacity,256);var oldContents=MEMFS.getFileDataAsTypedArray(node);node.contents=new Uint8Array(newCapacity);node.contents.set(oldContents)},resizeFileStorage(node,newSize){if(node.usedBytes==newSize)return;var oldContents=node.contents;node.contents=new Uint8Array(newSize);node.contents.set(oldContents.subarray(0,Math.min(newSize,node.usedBytes)));node.usedBytes=newSize},node_ops:{getattr(node){var attr={};attr.dev=FS.isChrdev(node.mode)?node.id:1;attr.ino=node.id;attr.mode=node.mode;attr.nlink=1;attr.uid=0;attr.gid=0;attr.rdev=node.rdev;if(FS.isDir(node.mode)){attr.size=4096}else if(FS.isFile(node.mode)){attr.size=node.usedBytes}else if(FS.isLink(node.mode)){attr.size=node.link.length}else{attr.size=0}attr.atime=new Date(node.atime);attr.mtime=new Date(node.mtime);attr.ctime=new Date(node.ctime);attr.blksize=4096;attr.blocks=Math.ceil(attr.size/attr.blksize);return attr},setattr(node,attr){for(const key of["mode","atime","mtime","ctime"]){if(attr[key]!=null){node[key]=attr[key]}}if(attr.size!==undefined){MEMFS.resizeFileStorage(node,attr.size)}},lookup(parent,name){throw new FS.ErrnoError(44)},mknod(parent,name,mode,dev){return MEMFS.createNode(parent,name,mode,dev)},rename(old_node,new_dir,new_name){var new_node;try{new_node=FS.lookupNode(new_dir,new_name)}catch(e){}if(new_node){if(FS.isDir(old_node.mode)){for(var i in new_node.contents){throw new FS.ErrnoError(55)}}FS.hashRemoveNode(new_node)}delete old_node.parent.contents[old_node.name];new_dir.contents[new_name]=old_node;old_node.name=new_name;new_dir.ctime=new_dir.mtime=old_node.parent.ctime=old_node.parent.mtime=Date.now()},unlink(parent,name){delete parent.contents[name];parent.ctime=parent.mtime=Date.now()},rmdir(parent,name){var node=FS.lookupNode(parent,name);for(var i in node.contents){throw new FS.ErrnoError(55)}delete parent.contents[name];parent.ctime=parent.mtime=Date.now()},readdir(node){return[".","..",...Object.keys(node.contents)]},symlink(parent,newname,oldpath){var node=MEMFS.createNode(parent,newname,511|40960,0);node.link=oldpath;return node},readlink(node){if(!FS.isLink(node.mode)){throw new FS.ErrnoError(28)}return node.link}},stream_ops:{read(stream,buffer,offset,length,position){var contents=stream.node.contents;if(position>=stream.node.usedBytes)return 0;var size=Math.min(stream.node.usedBytes-position,length);assert(size>=0);buffer.set(contents.subarray(position,position+size),offset);return size},write(stream,buffer,offset,length,position,canOwn){assert(buffer.subarray,"FS.write expects a TypedArray");if(buffer.buffer===HEAP8.buffer){canOwn=false}if(!length)return 0;var node=stream.node;node.mtime=node.ctime=Date.now();if(canOwn){assert(position===0,"canOwn must imply no weird position inside the file");node.contents=buffer.subarray(offset,offset+length);node.usedBytes=length}else if(node.usedBytes===0&&position===0){node.contents=buffer.slice(offset,offset+length);node.usedBytes=length}else{MEMFS.expandFileStorage(node,position+length);node.contents.set(buffer.subarray(offset,offset+length),position);node.usedBytes=Math.max(node.usedBytes,position+length)}return length},llseek(stream,offset,whence){var position=offset;if(whence===1){position+=stream.position}else if(whence===2){if(FS.isFile(stream.node.mode)){position+=stream.node.usedBytes}}if(position<0){throw new FS.ErrnoError(28)}return position},mmap(stream,length,position,prot,flags){if(!FS.isFile(stream.node.mode)){throw new FS.ErrnoError(43)}var ptr;var allocated;var contents=stream.node.contents;if(!(flags&2)&&contents.buffer===HEAP8.buffer){allocated=false;ptr=contents.byteOffset}else{allocated=true;ptr=mmapAlloc(length);if(!ptr){throw new FS.ErrnoError(48)}if(contents){if(position>0||position+length<contents.length){if(contents.subarray){contents=contents.subarray(position,position+length)}else{contents=Array.prototype.slice.call(contents,position,position+length)}}HEAP8.set(contents,ptr)}}return{ptr,allocated}},msync(stream,buffer,offset,length,mmapFlags){MEMFS.stream_ops.write(stream,buffer,0,length,offset,false);return 0}}};var FS_modeStringToFlags=str=>{if(typeof str!="string")return str;var flagModes={r:0,"r+":2,w:512|64|1,"w+":512|64|2,a:1024|64|1,"a+":1024|64|2};var flags=flagModes[str];if(typeof flags=="undefined"){throw new Error(`Unknown file open mode: ${str}`)}return flags};var FS_fileDataToTypedArray=data=>{if(typeof data=="string"){data=intArrayFromString(data,true)}if(!data.subarray){data=new Uint8Array(data)}return data};var FS_getMode=(canRead,canWrite)=>{var mode=0;if(canRead)mode|=292|73;if(canWrite)mode|=146;return mode};var strError=errno=>UTF8ToString(_strerror(errno));var ERRNO_CODES={EPERM:63,ENOENT:44,ESRCH:71,EINTR:27,EIO:29,ENXIO:60,E2BIG:1,ENOEXEC:45,EBADF:8,ECHILD:12,EAGAIN:6,EWOULDBLOCK:6,ENOMEM:48,EACCES:2,EFAULT:21,ENOTBLK:105,EBUSY:10,EEXIST:20,EXDEV:75,ENODEV:43,ENOTDIR:54,EISDIR:31,EINVAL:28,ENFILE:41,EMFILE:33,ENOTTY:59,ETXTBSY:74,EFBIG:22,ENOSPC:51,ESPIPE:70,EROFS:69,EMLINK:34,EPIPE:64,EDOM:18,ERANGE:68,ENOMSG:49,EIDRM:24,ECHRNG:106,EL2NSYNC:156,EL3HLT:107,EL3RST:108,ELNRNG:109,EUNATCH:110,ENOCSI:111,EL2HLT:112,EDEADLK:16,ENOLCK:46,EBADE:113,EBADR:114,EXFULL:115,ENOANO:104,EBADRQC:103,EBADSLT:102,EDEADLOCK:16,EBFONT:101,ENOSTR:100,ENODATA:116,ETIME:117,ENOSR:118,ENONET:119,ENOPKG:120,EREMOTE:121,ENOLINK:47,EADV:122,ESRMNT:123,ECOMM:124,EPROTO:65,EMULTIHOP:36,EDOTDOT:125,EBADMSG:9,ENOTUNIQ:126,EBADFD:127,EREMCHG:128,ELIBACC:129,ELIBBAD:130,ELIBSCN:131,ELIBMAX:132,ELIBEXEC:133,ENOSYS:52,ENOTEMPTY:55,ENAMETOOLONG:37,ELOOP:32,EOPNOTSUPP:138,EPFNOSUPPORT:139,ECONNRESET:15,ENOBUFS:42,EAFNOSUPPORT:5,EPROTOTYPE:67,ENOTSOCK:57,ENOPROTOOPT:50,ESHUTDOWN:140,ECONNREFUSED:14,EADDRINUSE:3,ECONNABORTED:13,ENETUNREACH:40,ENETDOWN:38,ETIMEDOUT:73,EHOSTDOWN:142,EHOSTUNREACH:23,EINPROGRESS:26,EALREADY:7,EDESTADDRREQ:17,EMSGSIZE:35,EPROTONOSUPPORT:66,ESOCKTNOSUPPORT:137,EADDRNOTAVAIL:4,ENETRESET:39,EISCONN:30,ENOTCONN:53,ETOOMANYREFS:141,EUSERS:136,EDQUOT:19,ESTALE:72,ENOTSUP:138,ENOMEDIUM:148,EILSEQ:25,EOVERFLOW:61,ECANCELED:11,ENOTRECOVERABLE:56,EOWNERDEAD:62,ESTRPIPE:135};var asyncLoad=async url=>{var arrayBuffer=await readAsync(url);assert(arrayBuffer,`Loading data file "${url}" failed (no arrayBuffer).`);return new Uint8Array(arrayBuffer)};var FS_createDataFile=(...args)=>FS.createDataFile(...args);var getUniqueRunDependency=id=>{var orig=id;while(1){if(!runDependencyTracking[id])return id;id=orig+Math.random()}};var preloadPlugins=[];var FS_handledByPreloadPlugin=async(byteArray,fullname)=>{if(typeof Browser!="undefined")Browser.init();for(var plugin of preloadPlugins){if(plugin["canHandle"](fullname)){assert(plugin["handle"].constructor.name==="AsyncFunction","Filesystem plugin handlers must be async functions (See #24914)");return plugin["handle"](byteArray,fullname)}}return byteArray};var FS_preloadFile=async(parent,name,url,canRead,canWrite,dontCreateFile,canOwn,preFinish)=>{var fullname=name?PATH_FS.resolve(PATH.join2(parent,name)):parent;var dep=getUniqueRunDependency(`cp ${fullname}`);addRunDependency(dep);try{var byteArray=url;if(typeof url=="string"){byteArray=await asyncLoad(url)}byteArray=await FS_handledByPreloadPlugin(byteArray,fullname);preFinish?.();if(!dontCreateFile){FS_createDataFile(parent,name,byteArray,canRead,canWrite,canOwn)}}finally{removeRunDependency(dep)}};var FS_createPreloadedFile=(parent,name,url,canRead,canWrite,onload,onerror,dontCreateFile,canOwn,preFinish)=>{FS_preloadFile(parent,name,url,canRead,canWrite,dontCreateFile,canOwn,preFinish).then(onload).catch(onerror)};var FS={root:null,mounts:[],devices:{},streams:[],nextInode:1,nameTable:null,currentPath:"/",initialized:false,ignorePermissions:true,filesystems:null,syncFSRequests:0,ErrnoError:class extends Error{name="ErrnoError";constructor(errno){super(runtimeInitialized?strError(errno):"");this.errno=errno;for(var key in ERRNO_CODES){if(ERRNO_CODES[key]===errno){this.code=key;break}}}},FSStream:class{shared={};get object(){return this.node}set object(val){this.node=val}get isRead(){return(this.flags&2097155)!==1}get isWrite(){return(this.flags&2097155)!==0}get isAppend(){return this.flags&1024}get flags(){return this.shared.flags}set flags(val){this.shared.flags=val}get position(){return this.shared.position}set position(val){this.shared.position=val}},FSNode:class{node_ops={};stream_ops={};readMode=292|73;writeMode=146;mounted=null;constructor(parent,name,mode,rdev){if(!parent){parent=this}this.parent=parent;this.mount=parent.mount;this.id=FS.nextInode++;this.name=name;this.mode=mode;this.rdev=rdev;this.atime=this.mtime=this.ctime=Date.now()}get read(){return(this.mode&this.readMode)===this.readMode}set read(val){val?this.mode|=this.readMode:this.mode&=~this.readMode}get write(){return(this.mode&this.writeMode)===this.writeMode}set write(val){val?this.mode|=this.writeMode:this.mode&=~this.writeMode}get isFolder(){return FS.isDir(this.mode)}get isDevice(){return FS.isChrdev(this.mode)}},lookupPath(path,opts={}){if(!path){throw new FS.ErrnoError(44)}opts.follow_mount??=true;if(!PATH.isAbs(path)){path=FS.cwd()+"/"+path}linkloop:for(var nlinks=0;nlinks<40;nlinks++){var parts=path.split("/").filter(p=>!!p);var current=FS.root;var current_path="/";for(var i=0;i<parts.length;i++){var islast=i===parts.length-1;if(islast&&opts.parent){break}if(parts[i]==="."){continue}if(parts[i]===".."){current_path=PATH.dirname(current_path);if(FS.isRoot(current)){path=current_path+"/"+parts.slice(i+1).join("/");nlinks--;continue linkloop}else{current=current.parent}continue}current_path=PATH.join2(current_path,parts[i]);try{current=FS.lookupNode(current,parts[i])}catch(e){if(e?.errno===44&&islast&&opts.noent_okay){return{path:current_path}}throw e}if(FS.isMountpoint(current)&&(!islast||opts.follow_mount)){current=current.mounted.root}if(FS.isLink(current.mode)&&(!islast||opts.follow)){if(!current.node_ops.readlink){throw new FS.ErrnoError(52)}var link=current.node_ops.readlink(current);if(!PATH.isAbs(link)){link=PATH.dirname(current_path)+"/"+link}path=link+"/"+parts.slice(i+1).join("/");continue linkloop}}return{path:current_path,node:current}}throw new FS.ErrnoError(32)},getPath(node){var path;while(true){if(FS.isRoot(node)){var mount=node.mount.mountpoint;if(!path)return mount;return mount[mount.length-1]!=="/"?`${mount}/${path}`:mount+path}path=path?`${node.name}/${path}`:node.name;node=node.parent}},hashName(parentid,name){var hash=0;for(var i=0;i<name.length;i++){hash=(hash<<5)-hash+name.charCodeAt(i)|0}return(parentid+hash>>>0)%FS.nameTable.length},hashAddNode(node){var hash=FS.hashName(node.parent.id,node.name);node.name_next=FS.nameTable[hash];FS.nameTable[hash]=node},hashRemoveNode(node){var hash=FS.hashName(node.parent.id,node.name);if(FS.nameTable[hash]===node){FS.nameTable[hash]=node.name_next}else{var current=FS.nameTable[hash];while(current){if(current.name_next===node){current.name_next=node.name_next;break}current=current.name_next}}},lookupNode(parent,name){var errCode=FS.mayLookup(parent);if(errCode){throw new FS.ErrnoError(errCode)}var hash=FS.hashName(parent.id,name);for(var node=FS.nameTable[hash];node;node=node.name_next){var nodeName=node.name;if(node.parent.id===parent.id&&nodeName===name){return node}}return FS.lookup(parent,name)},createNode(parent,name,mode,rdev){assert(typeof parent=="object");var node=new FS.FSNode(parent,name,mode,rdev);FS.hashAddNode(node);return node},destroyNode(node){FS.hashRemoveNode(node)},isRoot(node){return node===node.parent},isMountpoint(node){return!!node.mounted},isFile(mode){return(mode&61440)===32768},isDir(mode){return(mode&61440)===16384},isLink(mode){return(mode&61440)===40960},isChrdev(mode){return(mode&61440)===8192},isBlkdev(mode){return(mode&61440)===24576},isFIFO(mode){return(mode&61440)===4096},isSocket(mode){return(mode&49152)===49152},flagsToPermissionString(flag){var perms=["r","w","rw"][flag&3];if(flag&512){perms+="w"}return perms},nodePermissions(node,perms){if(FS.ignorePermissions){return 0}if(perms.includes("r")&&!(node.mode&292)){return 2}if(perms.includes("w")&&!(node.mode&146)){return 2}if(perms.includes("x")&&!(node.mode&73)){return 2}return 0},mayLookup(dir){if(!FS.isDir(dir.mode))return 54;var errCode=FS.nodePermissions(dir,"x");if(errCode)return errCode;if(!dir.node_ops.lookup)return 2;return 0},mayCreate(dir,name){if(!FS.isDir(dir.mode)){return 54}try{var node=FS.lookupNode(dir,name);return 20}catch(e){}return FS.nodePermissions(dir,"wx")},mayDelete(dir,name,isdir){var node;try{node=FS.lookupNode(dir,name)}catch(e){return e.errno}var errCode=FS.nodePermissions(dir,"wx");if(errCode){return errCode}if(isdir){if(!FS.isDir(node.mode)){return 54}if(FS.isRoot(node)||FS.getPath(node)===FS.cwd()){return 10}}else if(FS.isDir(node.mode)){return 31}return 0},mayOpen(node,flags){if(!node){return 44}if(FS.isLink(node.mode)){return 32}var mode=FS.flagsToPermissionString(flags);if(FS.isDir(node.mode)){if(mode!=="r"||flags&(512|64)){return 31}}return FS.nodePermissions(node,mode)},checkOpExists(op,err){if(!op){throw new FS.ErrnoError(err)}return op},MAX_OPEN_FDS:4096,nextfd(){for(var fd=0;fd<=FS.MAX_OPEN_FDS;fd++){if(!FS.streams[fd]){return fd}}throw new FS.ErrnoError(33)},getStreamChecked(fd){var stream=FS.getStream(fd);if(!stream){throw new FS.ErrnoError(8)}return stream},getStream:fd=>FS.streams[fd],createStream(stream,fd=-1){assert(fd>=-1);stream=Object.assign(new FS.FSStream,stream);if(fd==-1){fd=FS.nextfd()}stream.fd=fd;FS.streams[fd]=stream;return stream},closeStream(fd){FS.streams[fd]=null},dupStream(origStream,fd=-1){var stream=FS.createStream(origStream,fd);stream.stream_ops?.dup?.(stream);return stream},doSetAttr(stream,node,attr){var setattr=stream?.stream_ops.setattr;var arg=setattr?stream:node;setattr??=node.node_ops.setattr;FS.checkOpExists(setattr,63);setattr(arg,attr)},chrdev_stream_ops:{open(stream){var device=FS.getDevice(stream.node.rdev);stream.stream_ops=device.stream_ops;stream.stream_ops.open?.(stream)},llseek(){throw new FS.ErrnoError(70)}},major:dev=>dev>>8,minor:dev=>dev&255,makedev:(ma,mi)=>ma<<8|mi,registerDevice(dev,ops){FS.devices[dev]={stream_ops:ops}},getDevice:dev=>FS.devices[dev],getMounts(mount){var mounts=[];var check=[mount];while(check.length){var m=check.pop();mounts.push(m);check.push(...m.mounts)}return mounts},syncfs(populate,callback){if(typeof populate=="function"){callback=populate;populate=false}FS.syncFSRequests++;if(FS.syncFSRequests>1){err(`warning: ${FS.syncFSRequests} FS.syncfs operations in flight at once, probably just doing extra work`)}var mounts=FS.getMounts(FS.root.mount);var completed=0;function doCallback(errCode){assert(FS.syncFSRequests>0);FS.syncFSRequests--;return callback(errCode)}function done(errCode){if(errCode){if(!done.errored){done.errored=true;return doCallback(errCode)}return}if(++completed>=mounts.length){doCallback(null)}}for(var mount of mounts){if(mount.type.syncfs){mount.type.syncfs(mount,populate,done)}else{done(null)}}},mount(type,opts,mountpoint){if(typeof type=="string"){throw type}var root=mountpoint==="/";var pseudo=!mountpoint;var node;if(root&&FS.root){throw new FS.ErrnoError(10)}else if(!root&&!pseudo){var lookup=FS.lookupPath(mountpoint,{follow_mount:false});mountpoint=lookup.path;node=lookup.node;if(FS.isMountpoint(node)){throw new FS.ErrnoError(10)}if(!FS.isDir(node.mode)){throw new FS.ErrnoError(54)}}var mount={type,opts,mountpoint,mounts:[]};var mountRoot=type.mount(mount);mountRoot.mount=mount;mount.root=mountRoot;if(root){FS.root=mountRoot}else if(node){node.mounted=mount;if(node.mount){node.mount.mounts.push(mount)}}return mountRoot},unmount(mountpoint){var lookup=FS.lookupPath(mountpoint,{follow_mount:false});if(!FS.isMountpoint(lookup.node)){throw new FS.ErrnoError(28)}var node=lookup.node;var mount=node.mounted;var mounts=FS.getMounts(mount);for(var[hash,current]of Object.entries(FS.nameTable)){while(current){var next=current.name_next;if(mounts.includes(current.mount)){FS.destroyNode(current)}current=next}}node.mounted=null;var idx=node.mount.mounts.indexOf(mount);assert(idx!==-1);node.mount.mounts.splice(idx,1)},lookup(parent,name){return parent.node_ops.lookup(parent,name)},mknod(path,mode,dev){var lookup=FS.lookupPath(path,{parent:true});var parent=lookup.node;var name=PATH.basename(path);if(!name){throw new FS.ErrnoError(28)}if(name==="."||name===".."){throw new FS.ErrnoError(20)}var errCode=FS.mayCreate(parent,name);if(errCode){throw new FS.ErrnoError(errCode)}if(!parent.node_ops.mknod){throw new FS.ErrnoError(63)}return parent.node_ops.mknod(parent,name,mode,dev)},statfs(path){return FS.statfsNode(FS.lookupPath(path,{follow:true}).node)},statfsStream(stream){return FS.statfsNode(stream.node)},statfsNode(node){var rtn={bsize:4096,frsize:4096,blocks:1e6,bfree:5e5,bavail:5e5,files:FS.nextInode,ffree:FS.nextInode-1,fsid:42,flags:2,namelen:255};if(node.node_ops.statfs){Object.assign(rtn,node.node_ops.statfs(node.mount.opts.root))}return rtn},create(path,mode=438){mode&=4095;mode|=32768;return FS.mknod(path,mode,0)},mkdir(path,mode=511){mode&=511|512;mode|=16384;return FS.mknod(path,mode,0)},mkdirTree(path,mode){var dirs=path.split("/");var d="";for(var dir of dirs){if(!dir)continue;if(d||PATH.isAbs(path))d+="/";d+=dir;try{FS.mkdir(d,mode)}catch(e){if(e.errno!=20)throw e}}},mkdev(path,mode,dev){if(typeof dev=="undefined"){dev=mode;mode=438}mode|=8192;return FS.mknod(path,mode,dev)},symlink(oldpath,newpath){if(!PATH_FS.resolve(oldpath)){throw new FS.ErrnoError(44)}var lookup=FS.lookupPath(newpath,{parent:true});var parent=lookup.node;if(!parent){throw new FS.ErrnoError(44)}var newname=PATH.basename(newpath);var errCode=FS.mayCreate(parent,newname);if(errCode){throw new FS.ErrnoError(errCode)}if(!parent.node_ops.symlink){throw new FS.ErrnoError(63)}return parent.node_ops.symlink(parent,newname,oldpath)},rename(old_path,new_path){var old_dirname=PATH.dirname(old_path);var new_dirname=PATH.dirname(new_path);var old_name=PATH.basename(old_path);var new_name=PATH.basename(new_path);var lookup,old_dir,new_dir;lookup=FS.lookupPath(old_path,{parent:true});old_dir=lookup.node;lookup=FS.lookupPath(new_path,{parent:true});new_dir=lookup.node;if(!old_dir||!new_dir)throw new FS.ErrnoError(44);if(old_dir.mount!==new_dir.mount){throw new FS.ErrnoError(75)}var old_node=FS.lookupNode(old_dir,old_name);var relative=PATH_FS.relative(old_path,new_dirname);if(relative.charAt(0)!=="."){throw new FS.ErrnoError(28)}relative=PATH_FS.relative(new_path,old_dirname);if(relative.charAt(0)!=="."){throw new FS.ErrnoError(55)}var new_node;try{new_node=FS.lookupNode(new_dir,new_name)}catch(e){}if(old_node===new_node){return}var isdir=FS.isDir(old_node.mode);var errCode=FS.mayDelete(old_dir,old_name,isdir);if(errCode){throw new FS.ErrnoError(errCode)}errCode=new_node?FS.mayDelete(new_dir,new_name,isdir):FS.mayCreate(new_dir,new_name);if(errCode){throw new FS.ErrnoError(errCode)}if(!old_dir.node_ops.rename){throw new FS.ErrnoError(63)}if(FS.isMountpoint(old_node)||new_node&&FS.isMountpoint(new_node)){throw new FS.ErrnoError(10)}if(new_dir!==old_dir){errCode=FS.nodePermissions(old_dir,"w");if(errCode){throw new FS.ErrnoError(errCode)}}FS.hashRemoveNode(old_node);try{old_dir.node_ops.rename(old_node,new_dir,new_name);old_node.parent=new_dir}catch(e){throw e}finally{FS.hashAddNode(old_node)}},rmdir(path){var lookup=FS.lookupPath(path,{parent:true});var parent=lookup.node;var name=PATH.basename(path);var node=FS.lookupNode(parent,name);var errCode=FS.mayDelete(parent,name,true);if(errCode){throw new FS.ErrnoError(errCode)}if(!parent.node_ops.rmdir){throw new FS.ErrnoError(63)}if(FS.isMountpoint(node)){throw new FS.ErrnoError(10)}parent.node_ops.rmdir(parent,name);FS.destroyNode(node)},readdir(path){var lookup=FS.lookupPath(path,{follow:true});var node=lookup.node;var readdir=FS.checkOpExists(node.node_ops.readdir,54);return readdir(node)},unlink(path){var lookup=FS.lookupPath(path,{parent:true});var parent=lookup.node;if(!parent){throw new FS.ErrnoError(44)}var name=PATH.basename(path);var node=FS.lookupNode(parent,name);var errCode=FS.mayDelete(parent,name,false);if(errCode){throw new FS.ErrnoError(errCode)}if(!parent.node_ops.unlink){throw new FS.ErrnoError(63)}if(FS.isMountpoint(node)){throw new FS.ErrnoError(10)}parent.node_ops.unlink(parent,name);FS.destroyNode(node)},readlink(path){var lookup=FS.lookupPath(path);var link=lookup.node;if(!link){throw new FS.ErrnoError(44)}if(!link.node_ops.readlink){throw new FS.ErrnoError(28)}return link.node_ops.readlink(link)},stat(path,dontFollow){var lookup=FS.lookupPath(path,{follow:!dontFollow});var node=lookup.node;var getattr=FS.checkOpExists(node.node_ops.getattr,63);return getattr(node)},fstat(fd){var stream=FS.getStreamChecked(fd);var node=stream.node;var getattr=stream.stream_ops.getattr;var arg=getattr?stream:node;getattr??=node.node_ops.getattr;FS.checkOpExists(getattr,63);return getattr(arg)},lstat(path){return FS.stat(path,true)},doChmod(stream,node,mode,dontFollow){FS.doSetAttr(stream,node,{mode:mode&4095|node.mode&~4095,ctime:Date.now(),dontFollow})},chmod(path,mode,dontFollow){var node;if(typeof path=="string"){var lookup=FS.lookupPath(path,{follow:!dontFollow});node=lookup.node}else{node=path}FS.doChmod(null,node,mode,dontFollow)},lchmod(path,mode){FS.chmod(path,mode,true)},fchmod(fd,mode){var stream=FS.getStreamChecked(fd);FS.doChmod(stream,stream.node,mode,false)},doChown(stream,node,dontFollow){FS.doSetAttr(stream,node,{timestamp:Date.now(),dontFollow})},chown(path,uid,gid,dontFollow){var node;if(typeof path=="string"){var lookup=FS.lookupPath(path,{follow:!dontFollow});node=lookup.node}else{node=path}FS.doChown(null,node,dontFollow)},lchown(path,uid,gid){FS.chown(path,uid,gid,true)},fchown(fd,uid,gid){var stream=FS.getStreamChecked(fd);FS.doChown(stream,stream.node,false)},doTruncate(stream,node,len){if(FS.isDir(node.mode)){throw new FS.ErrnoError(31)}if(!FS.isFile(node.mode)){throw new FS.ErrnoError(28)}var errCode=FS.nodePermissions(node,"w");if(errCode){throw new FS.ErrnoError(errCode)}FS.doSetAttr(stream,node,{size:len,timestamp:Date.now()})},truncate(path,len){if(len<0){throw new FS.ErrnoError(28)}var node;if(typeof path=="string"){var lookup=FS.lookupPath(path,{follow:true});node=lookup.node}else{node=path}FS.doTruncate(null,node,len)},ftruncate(fd,len){var stream=FS.getStreamChecked(fd);if(len<0||(stream.flags&2097155)===0){throw new FS.ErrnoError(28)}FS.doTruncate(stream,stream.node,len)},utime(path,atime,mtime){var lookup=FS.lookupPath(path,{follow:true});var node=lookup.node;var setattr=FS.checkOpExists(node.node_ops.setattr,63);setattr(node,{atime,mtime})},open(path,flags,mode=438){if(path===""){throw new FS.ErrnoError(44)}flags=FS_modeStringToFlags(flags);if(flags&64){mode=mode&4095|32768}else{mode=0}var node;var isDirPath;if(typeof path=="object"){node=path}else{isDirPath=path.endsWith("/");var lookup=FS.lookupPath(path,{follow:!(flags&131072),noent_okay:true});node=lookup.node;path=lookup.path}var created=false;if(flags&64){if(node){if(flags&128){throw new FS.ErrnoError(20)}}else if(isDirPath){throw new FS.ErrnoError(31)}else{node=FS.mknod(path,mode|511,0);created=true}}if(!node){throw new FS.ErrnoError(44)}if(FS.isChrdev(node.mode)){flags&=~512}if(flags&65536&&!FS.isDir(node.mode)){throw new FS.ErrnoError(54)}if(!created){var errCode=FS.mayOpen(node,flags);if(errCode){throw new FS.ErrnoError(errCode)}}if(flags&512&&!created){FS.truncate(node,0)}flags&=~(128|512|131072);var stream=FS.createStream({node,path:FS.getPath(node),flags,seekable:true,position:0,stream_ops:node.stream_ops,ungotten:[],error:false});if(stream.stream_ops.open){stream.stream_ops.open(stream)}if(created){FS.chmod(node,mode&511)}return stream},close(stream){if(FS.isClosed(stream)){throw new FS.ErrnoError(8)}if(stream.getdents)stream.getdents=null;try{if(stream.stream_ops.close){stream.stream_ops.close(stream)}}catch(e){throw e}finally{FS.closeStream(stream.fd)}stream.fd=null},isClosed(stream){return stream.fd===null},llseek(stream,offset,whence){if(FS.isClosed(stream)){throw new FS.ErrnoError(8)}if(!stream.seekable||!stream.stream_ops.llseek){throw new FS.ErrnoError(70)}if(whence!=0&&whence!=1&&whence!=2){throw new FS.ErrnoError(28)}stream.position=stream.stream_ops.llseek(stream,offset,whence);stream.ungotten=[];return stream.position},read(stream,buffer,offset,length,position){assert(offset>=0);if(length<0||position<0){throw new FS.ErrnoError(28)}if(FS.isClosed(stream)){throw new FS.ErrnoError(8)}if((stream.flags&2097155)===1){throw new FS.ErrnoError(8)}if(FS.isDir(stream.node.mode)){throw new FS.ErrnoError(31)}if(!stream.stream_ops.read){throw new FS.ErrnoError(28)}var seeking=typeof position!="undefined";if(!seeking){position=stream.position}else if(!stream.seekable){throw new FS.ErrnoError(70)}var bytesRead=stream.stream_ops.read(stream,buffer,offset,length,position);if(!seeking)stream.position+=bytesRead;return bytesRead},write(stream,buffer,offset,length,position,canOwn){assert(offset>=0);assert(buffer.subarray,"FS.write expects a TypedArray");if(length<0||position<0){throw new FS.ErrnoError(28)}if(FS.isClosed(stream)){throw new FS.ErrnoError(8)}if((stream.flags&2097155)===0){throw new FS.ErrnoError(8)}if(FS.isDir(stream.node.mode)){throw new FS.ErrnoError(31)}if(!stream.stream_ops.write){throw new FS.ErrnoError(28)}if(stream.seekable&&stream.flags&1024){FS.llseek(stream,0,2)}var seeking=typeof position!="undefined";if(!seeking){position=stream.position}else if(!stream.seekable){throw new FS.ErrnoError(70)}var bytesWritten=stream.stream_ops.write(stream,buffer,offset,length,position,canOwn);if(!seeking)stream.position+=bytesWritten;return bytesWritten},mmap(stream,length,position,prot,flags){if((prot&2)!==0&&(flags&2)===0&&(stream.flags&2097155)!==2){throw new FS.ErrnoError(2)}if((stream.flags&2097155)===1){throw new FS.ErrnoError(2)}if(!stream.stream_ops.mmap){throw new FS.ErrnoError(43)}if(!length){throw new FS.ErrnoError(28)}return stream.stream_ops.mmap(stream,length,position,prot,flags)},msync(stream,buffer,offset,length,mmapFlags){assert(offset>=0);if(!stream.stream_ops.msync){return 0}return stream.stream_ops.msync(stream,buffer,offset,length,mmapFlags)},ioctl(stream,cmd,arg){if(!stream.stream_ops.ioctl){throw new FS.ErrnoError(59)}return stream.stream_ops.ioctl(stream,cmd,arg)},readFile(path,opts={}){opts.flags=opts.flags||0;opts.encoding=opts.encoding||"binary";if(opts.encoding!=="utf8"&&opts.encoding!=="binary"){abort(`Invalid encoding type "${opts.encoding}"`)}var stream=FS.open(path,opts.flags);var stat=FS.stat(path);var length=stat.size;var buf=new Uint8Array(length);FS.read(stream,buf,0,length,0);if(opts.encoding==="utf8"){buf=UTF8ArrayToString(buf)}FS.close(stream);return buf},writeFile(path,data,opts={}){opts.flags=opts.flags||577;var stream=FS.open(path,opts.flags,opts.mode);data=FS_fileDataToTypedArray(data);FS.write(stream,data,0,data.byteLength,undefined,opts.canOwn);FS.close(stream)},cwd:()=>FS.currentPath,chdir(path){var lookup=FS.lookupPath(path,{follow:true});if(lookup.node===null){throw new FS.ErrnoError(44)}if(!FS.isDir(lookup.node.mode)){throw new FS.ErrnoError(54)}var errCode=FS.nodePermissions(lookup.node,"x");if(errCode){throw new FS.ErrnoError(errCode)}FS.currentPath=lookup.path},createDefaultDirectories(){FS.mkdir("/tmp");FS.mkdir("/home");FS.mkdir("/home/web_user")},createDefaultDevices(){FS.mkdir("/dev");FS.registerDevice(FS.makedev(1,3),{read:()=>0,write:(stream,buffer,offset,length,pos)=>length,llseek:()=>0});FS.mkdev("/dev/null",FS.makedev(1,3));TTY.register(FS.makedev(5,0),TTY.default_tty_ops);TTY.register(FS.makedev(6,0),TTY.default_tty1_ops);FS.mkdev("/dev/tty",FS.makedev(5,0));FS.mkdev("/dev/tty1",FS.makedev(6,0));var randomBuffer=new Uint8Array(1024),randomLeft=0;var randomByte=()=>{if(randomLeft===0){randomFill(randomBuffer);randomLeft=randomBuffer.byteLength}return randomBuffer[--randomLeft]};FS.createDevice("/dev","random",randomByte);FS.createDevice("/dev","urandom",randomByte);FS.mkdir("/dev/shm");FS.mkdir("/dev/shm/tmp")},createSpecialDirectories(){FS.mkdir("/proc");var proc_self=FS.mkdir("/proc/self");FS.mkdir("/proc/self/fd");FS.mount({mount(){var node=FS.createNode(proc_self,"fd",16895,73);node.stream_ops={llseek:MEMFS.stream_ops.llseek};node.node_ops={lookup(parent,name){var fd=+name;var stream=FS.getStreamChecked(fd);var ret={parent:null,mount:{mountpoint:"fake"},node_ops:{readlink:()=>stream.path},id:fd+1};ret.parent=ret;return ret},readdir(){return Array.from(FS.streams.entries()).filter(([k,v])=>v).map(([k,v])=>k.toString())}};return node}},{},"/proc/self/fd")},createStandardStreams(input,output,error){if(input){FS.createDevice("/dev","stdin",input)}else{FS.symlink("/dev/tty","/dev/stdin")}if(output){FS.createDevice("/dev","stdout",null,output)}else{FS.symlink("/dev/tty","/dev/stdout")}if(error){FS.createDevice("/dev","stderr",null,error)}else{FS.symlink("/dev/tty1","/dev/stderr")}var stdin=FS.open("/dev/stdin",0);var stdout=FS.open("/dev/stdout",1);var stderr=FS.open("/dev/stderr",1);assert(stdin.fd===0,`invalid handle for stdin (${stdin.fd})`);assert(stdout.fd===1,`invalid handle for stdout (${stdout.fd})`);assert(stderr.fd===2,`invalid handle for stderr (${stderr.fd})`)},staticInit(){FS.nameTable=new Array(4096);FS.mount(MEMFS,{},"/");FS.createDefaultDirectories();FS.createDefaultDevices();FS.createSpecialDirectories();FS.filesystems={MEMFS}},init(input,output,error){assert(!FS.initialized,"FS.init was previously called. If you want to initialize later with custom parameters, remove any earlier calls (note that one is automatically added to the generated code)");FS.initialized=true;input??=Module["stdin"];output??=Module["stdout"];error??=Module["stderr"];FS.createStandardStreams(input,output,error)},quit(){FS.initialized=false;_fflush(0);for(var stream of FS.streams){if(stream){FS.close(stream)}}},findObject(path,dontResolveLastLink){var ret=FS.analyzePath(path,dontResolveLastLink);if(!ret.exists){return null}return ret.object},analyzePath(path,dontResolveLastLink){try{var lookup=FS.lookupPath(path,{follow:!dontResolveLastLink});path=lookup.path}catch(e){}var ret={isRoot:false,exists:false,error:0,name:null,path:null,object:null,parentExists:false,parentPath:null,parentObject:null};try{var lookup=FS.lookupPath(path,{parent:true});ret.parentExists=true;ret.parentPath=lookup.path;ret.parentObject=lookup.node;ret.name=PATH.basename(path);lookup=FS.lookupPath(path,{follow:!dontResolveLastLink});ret.exists=true;ret.path=lookup.path;ret.object=lookup.node;ret.name=lookup.node.name;ret.isRoot=lookup.path==="/"}catch(e){ret.error=e.errno}return ret},createPath(parent,path,canRead,canWrite){parent=typeof parent=="string"?parent:FS.getPath(parent);var parts=path.split("/").reverse();while(parts.length){var part=parts.pop();if(!part)continue;var current=PATH.join2(parent,part);try{FS.mkdir(current)}catch(e){if(e.errno!=20)throw e}parent=current}return current},createFile(parent,name,properties,canRead,canWrite){var path=PATH.join2(typeof parent=="string"?parent:FS.getPath(parent),name);var mode=FS_getMode(canRead,canWrite);return FS.create(path,mode)},createDataFile(parent,name,data,canRead,canWrite,canOwn){var path=name;if(parent){parent=typeof parent=="string"?parent:FS.getPath(parent);path=name?PATH.join2(parent,name):parent}var mode=FS_getMode(canRead,canWrite);var node=FS.create(path,mode);if(data){data=FS_fileDataToTypedArray(data);FS.chmod(node,mode|146);var stream=FS.open(node,577);FS.write(stream,data,0,data.length,0,canOwn);FS.close(stream);FS.chmod(node,mode)}},createDevice(parent,name,input,output){var path=PATH.join2(typeof parent=="string"?parent:FS.getPath(parent),name);var mode=FS_getMode(!!input,!!output);FS.createDevice.major??=64;var dev=FS.makedev(FS.createDevice.major++,0);FS.registerDevice(dev,{open(stream){stream.seekable=false},close(stream){if(output?.buffer?.length){output(10)}},read(stream,buffer,offset,length,pos){var bytesRead=0;for(var i=0;i<length;i++){var result;try{result=input()}catch(e){throw new FS.ErrnoError(29)}if(result===undefined&&bytesRead===0){throw new FS.ErrnoError(6)}if(result===null||result===undefined)break;bytesRead++;buffer[offset+i]=result}if(bytesRead){stream.node.atime=Date.now()}return bytesRead},write(stream,buffer,offset,length,pos){for(var i=0;i<length;i++){try{output(buffer[offset+i])}catch(e){throw new FS.ErrnoError(29)}}if(length){stream.node.mtime=stream.node.ctime=Date.now()}return i}});return FS.mkdev(path,mode,dev)},forceLoadFile(obj){if(obj.isDevice||obj.isFolder||obj.link||obj.contents)return true;if(globalThis.XMLHttpRequest){abort("Lazy loading should have been performed (contents set) in createLazyFile, but it was not. Lazy loading only works in web workers. Use --embed-file or --preload-file in emcc on the main thread.")}else{try{obj.contents=readBinary(obj.url)}catch(e){throw new FS.ErrnoError(29)}}},createLazyFile(parent,name,url,canRead,canWrite){class LazyUint8Array{lengthKnown=false;chunks=[];get(idx){if(idx>this.length-1||idx<0){return undefined}var chunkOffset=idx%this.chunkSize;var chunkNum=idx/this.chunkSize|0;return this.getter(chunkNum)[chunkOffset]}setDataGetter(getter){this.getter=getter}cacheLength(){var xhr=new XMLHttpRequest;xhr.open("HEAD",url,false);xhr.send(null);if(!(xhr.status>=200&&xhr.status<300||xhr.status===304))abort("Couldn\'t load "+url+". Status: "+xhr.status);var datalength=Number(xhr.getResponseHeader("Content-length"));var header;var hasByteServing=(header=xhr.getResponseHeader("Accept-Ranges"))&&header==="bytes";var usesGzip=(header=xhr.getResponseHeader("Content-Encoding"))&&header==="gzip";var chunkSize=1024*1024;if(!hasByteServing)chunkSize=datalength;var doXHR=(from,to)=>{if(from>to)abort("invalid range ("+from+", "+to+") or no bytes requested!");if(to>datalength-1)abort("only "+datalength+" bytes available! programmer error!");var xhr=new XMLHttpRequest;xhr.open("GET",url,false);if(datalength!==chunkSize)xhr.setRequestHeader("Range","bytes="+from+"-"+to);xhr.responseType="arraybuffer";if(xhr.overrideMimeType){xhr.overrideMimeType("text/plain; charset=x-user-defined")}xhr.send(null);if(!(xhr.status>=200&&xhr.status<300||xhr.status===304))abort("Couldn\'t load "+url+". Status: "+xhr.status);if(xhr.response!==undefined){return new Uint8Array(xhr.response||[])}return intArrayFromString(xhr.responseText||"",true)};var lazyArray=this;lazyArray.setDataGetter(chunkNum=>{var start=chunkNum*chunkSize;var end=(chunkNum+1)*chunkSize-1;end=Math.min(end,datalength-1);if(typeof lazyArray.chunks[chunkNum]=="undefined"){lazyArray.chunks[chunkNum]=doXHR(start,end)}if(typeof lazyArray.chunks[chunkNum]=="undefined")abort("doXHR failed!");return lazyArray.chunks[chunkNum]});if(usesGzip||!datalength){chunkSize=datalength=1;datalength=this.getter(0).length;chunkSize=datalength;out("LazyFiles on gzip forces download of the whole file when length is accessed")}this._length=datalength;this._chunkSize=chunkSize;this.lengthKnown=true}get length(){if(!this.lengthKnown){this.cacheLength()}return this._length}get chunkSize(){if(!this.lengthKnown){this.cacheLength()}return this._chunkSize}}if(globalThis.XMLHttpRequest){if(!ENVIRONMENT_IS_WORKER)abort("Cannot do synchronous binary XHRs outside webworkers in modern browsers. Use --embed-file or --preload-file in emcc");var lazyArray=new LazyUint8Array;var properties={isDevice:false,contents:lazyArray}}else{var properties={isDevice:false,url}}var node=FS.createFile(parent,name,properties,canRead,canWrite);if(properties.contents){node.contents=properties.contents}else if(properties.url){node.contents=null;node.url=properties.url}Object.defineProperties(node,{usedBytes:{get:function(){return this.contents.length}}});var stream_ops={};for(const[key,fn]of Object.entries(node.stream_ops)){stream_ops[key]=(...args)=>{FS.forceLoadFile(node);return fn(...args)}}function writeChunks(stream,buffer,offset,length,position){var contents=stream.node.contents;if(position>=contents.length)return 0;var size=Math.min(contents.length-position,length);assert(size>=0);if(contents.slice){for(var i=0;i<size;i++){buffer[offset+i]=contents[position+i]}}else{for(var i=0;i<size;i++){buffer[offset+i]=contents.get(position+i)}}return size}stream_ops.read=(stream,buffer,offset,length,position)=>{FS.forceLoadFile(node);return writeChunks(stream,buffer,offset,length,position)};stream_ops.mmap=(stream,length,position,prot,flags)=>{FS.forceLoadFile(node);var ptr=mmapAlloc(length);if(!ptr){throw new FS.ErrnoError(48)}writeChunks(stream,HEAP8,ptr,length,position);return{ptr,allocated:true}};node.stream_ops=stream_ops;return node}};var SYSCALLS={calculateAt(dirfd,path,allowEmpty){if(PATH.isAbs(path)){return path}var dir;if(dirfd===-100){dir=FS.cwd()}else{var dirstream=SYSCALLS.getStreamFromFD(dirfd);dir=dirstream.path}if(path.length==0){if(!allowEmpty){throw new FS.ErrnoError(44)}return dir}return dir+"/"+path},writeStat(buf,stat){HEAPU32[buf>>2]=stat.dev;HEAPU32[buf+4>>2]=stat.mode;HEAPU32[buf+8>>2]=stat.nlink;HEAPU32[buf+12>>2]=stat.uid;HEAPU32[buf+16>>2]=stat.gid;HEAPU32[buf+20>>2]=stat.rdev;HEAP64[buf+24>>3]=BigInt(stat.size);HEAP32[buf+32>>2]=4096;HEAP32[buf+36>>2]=stat.blocks;var atime=stat.atime.getTime();var mtime=stat.mtime.getTime();var ctime=stat.ctime.getTime();HEAP64[buf+40>>3]=BigInt(Math.floor(atime/1e3));HEAPU32[buf+48>>2]=atime%1e3*1e3*1e3;HEAP64[buf+56>>3]=BigInt(Math.floor(mtime/1e3));HEAPU32[buf+64>>2]=mtime%1e3*1e3*1e3;HEAP64[buf+72>>3]=BigInt(Math.floor(ctime/1e3));HEAPU32[buf+80>>2]=ctime%1e3*1e3*1e3;HEAP64[buf+88>>3]=BigInt(stat.ino);return 0},writeStatFs(buf,stats){HEAPU32[buf+4>>2]=stats.bsize;HEAPU32[buf+60>>2]=stats.bsize;HEAP64[buf+8>>3]=BigInt(stats.blocks);HEAP64[buf+16>>3]=BigInt(stats.bfree);HEAP64[buf+24>>3]=BigInt(stats.bavail);HEAP64[buf+32>>3]=BigInt(stats.files);HEAP64[buf+40>>3]=BigInt(stats.ffree);HEAPU32[buf+48>>2]=stats.fsid;HEAPU32[buf+64>>2]=stats.flags;HEAPU32[buf+56>>2]=stats.namelen},doMsync(addr,stream,len,flags,offset){if(!FS.isFile(stream.node.mode)){throw new FS.ErrnoError(43)}if(flags&2){return 0}var buffer=HEAPU8.slice(addr,addr+len);FS.msync(stream,buffer,offset,len,flags)},getStreamFromFD(fd){var stream=FS.getStreamChecked(fd);return stream},varargs:undefined,getStr(ptr){var ret=UTF8ToString(ptr);return ret}};function ___syscall_fcntl64(fd,cmd,varargs){SYSCALLS.varargs=varargs;try{var stream=SYSCALLS.getStreamFromFD(fd);switch(cmd){case 0:{var arg=syscallGetVarargI();if(arg<0){return-28}while(FS.streams[arg]){arg++}var newStream;newStream=FS.dupStream(stream,arg);return newStream.fd}case 1:case 2:return 0;case 3:return stream.flags;case 4:{var arg=syscallGetVarargI();stream.flags|=arg;return 0}case 12:{var arg=syscallGetVarargP();var offset=0;HEAP16[arg+offset>>1]=2;return 0}case 13:case 14:return 0}return-28}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return-e.errno}}function ___syscall_ioctl(fd,op,varargs){SYSCALLS.varargs=varargs;try{var stream=SYSCALLS.getStreamFromFD(fd);switch(op){case 21509:{if(!stream.tty)return-59;return 0}case 21505:{if(!stream.tty)return-59;if(stream.tty.ops.ioctl_tcgets){var termios=stream.tty.ops.ioctl_tcgets(stream);var argp=syscallGetVarargP();HEAP32[argp>>2]=termios.c_iflag||0;HEAP32[argp+4>>2]=termios.c_oflag||0;HEAP32[argp+8>>2]=termios.c_cflag||0;HEAP32[argp+12>>2]=termios.c_lflag||0;for(var i=0;i<32;i++){HEAP8[argp+i+17]=termios.c_cc[i]||0}return 0}return 0}case 21510:case 21511:case 21512:{if(!stream.tty)return-59;return 0}case 21506:case 21507:case 21508:{if(!stream.tty)return-59;if(stream.tty.ops.ioctl_tcsets){var argp=syscallGetVarargP();var c_iflag=HEAP32[argp>>2];var c_oflag=HEAP32[argp+4>>2];var c_cflag=HEAP32[argp+8>>2];var c_lflag=HEAP32[argp+12>>2];var c_cc=[];for(var i=0;i<32;i++){c_cc.push(HEAP8[argp+i+17])}return stream.tty.ops.ioctl_tcsets(stream.tty,op,{c_iflag,c_oflag,c_cflag,c_lflag,c_cc})}return 0}case 21519:{if(!stream.tty)return-59;var argp=syscallGetVarargP();HEAP32[argp>>2]=0;return 0}case 21520:{if(!stream.tty)return-59;return-28}case 21537:case 21531:{var argp=syscallGetVarargP();return FS.ioctl(stream,op,argp)}case 21523:{if(!stream.tty)return-59;if(stream.tty.ops.ioctl_tiocgwinsz){var winsize=stream.tty.ops.ioctl_tiocgwinsz(stream.tty);var argp=syscallGetVarargP();HEAP16[argp>>1]=winsize[0];HEAP16[argp+2>>1]=winsize[1]}return 0}case 21524:{if(!stream.tty)return-59;return 0}case 21515:{if(!stream.tty)return-59;return 0}default:return-28}}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return-e.errno}}function ___syscall_openat(dirfd,path,flags,varargs){SYSCALLS.varargs=varargs;try{path=SYSCALLS.getStr(path);path=SYSCALLS.calculateAt(dirfd,path);var mode=varargs?syscallGetVarargI():0;return FS.open(path,flags,mode).fd}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return-e.errno}}var __abort_js=()=>abort("native code called abort()");var runtimeKeepaliveCounter=0;var __emscripten_runtime_keepalive_clear=()=>{noExitRuntime=false;runtimeKeepaliveCounter=0};var INT53_MAX=9007199254740992;var INT53_MIN=-9007199254740992;var bigintToI53Checked=num=>num<INT53_MIN||num>INT53_MAX?NaN:Number(num);function __mmap_js(len,prot,flags,fd,offset,allocated,addr){offset=bigintToI53Checked(offset);try{assert(!isNaN(offset));var stream=SYSCALLS.getStreamFromFD(fd);var res=FS.mmap(stream,len,offset,prot,flags);var ptr=res.ptr;HEAP32[allocated>>2]=res.allocated;HEAPU32[addr>>2]=ptr;return 0}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return-e.errno}}function __munmap_js(addr,len,prot,flags,fd,offset){offset=bigintToI53Checked(offset);try{var stream=SYSCALLS.getStreamFromFD(fd);if(prot&2){SYSCALLS.doMsync(addr,stream,len,flags,offset)}}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return-e.errno}}var timers={};var handleException=e=>{if(e instanceof ExitStatus||e=="unwind"){return EXITSTATUS}checkStackCookie();if(e instanceof WebAssembly.RuntimeError){if(_emscripten_stack_get_current()<=0){err("Stack overflow detected.  You can try increasing -sSTACK_SIZE (currently set to 65536)")}}quit_(1,e)};var keepRuntimeAlive=()=>noExitRuntime||runtimeKeepaliveCounter>0;var _proc_exit=code=>{EXITSTATUS=code;if(!keepRuntimeAlive()){Module["onExit"]?.(code);ABORT=true}quit_(code,new ExitStatus(code))};var exitJS=(status,implicit)=>{EXITSTATUS=status;checkUnflushedContent();if(keepRuntimeAlive()&&!implicit){var msg=`program exited (with status: ${status}), but keepRuntimeAlive() is set (counter=${runtimeKeepaliveCounter}) due to an async operation, so halting execution but not exiting the runtime or preventing further async execution (you can use emscripten_force_exit, if you want to force a true shutdown)`;err(msg)}_proc_exit(status)};var _exit=exitJS;var maybeExit=()=>{if(!keepRuntimeAlive()){try{_exit(EXITSTATUS)}catch(e){handleException(e)}}};var callUserCallback=func=>{if(ABORT){err("user callback triggered after runtime exited or application aborted.  Ignoring.");return}try{return func()}catch(e){handleException(e)}finally{maybeExit()}};var _emscripten_get_now=()=>performance.now();var __setitimer_js=(which,timeout_ms)=>{if(timers[which]){clearTimeout(timers[which].id);delete timers[which]}if(!timeout_ms)return 0;var id=setTimeout(()=>{assert(which in timers);delete timers[which];callUserCallback(()=>__emscripten_timeout(which,_emscripten_get_now()))},timeout_ms);timers[which]={id,timeout_ms};return 0};var stringToUTF8=(str,outPtr,maxBytesToWrite)=>{assert(typeof maxBytesToWrite=="number","stringToUTF8(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!");return stringToUTF8Array(str,HEAPU8,outPtr,maxBytesToWrite)};var __tzset_js=(timezone,daylight,std_name,dst_name)=>{var currentYear=(new Date).getFullYear();var winter=new Date(currentYear,0,1);var summer=new Date(currentYear,6,1);var winterOffset=winter.getTimezoneOffset();var summerOffset=summer.getTimezoneOffset();var stdTimezoneOffset=Math.max(winterOffset,summerOffset);HEAPU32[timezone>>2]=stdTimezoneOffset*60;HEAP32[daylight>>2]=Number(winterOffset!=summerOffset);var extractZone=timezoneOffset=>{var sign=timezoneOffset>=0?"-":"+";var absOffset=Math.abs(timezoneOffset);var hours=String(Math.floor(absOffset/60)).padStart(2,"0");var minutes=String(absOffset%60).padStart(2,"0");return`UTC${sign}${hours}${minutes}`};var winterName=extractZone(winterOffset);var summerName=extractZone(summerOffset);assert(winterName);assert(summerName);assert(lengthBytesUTF8(winterName)<=16,`timezone name truncated to fit in TZNAME_MAX (${winterName})`);assert(lengthBytesUTF8(summerName)<=16,`timezone name truncated to fit in TZNAME_MAX (${summerName})`);if(summerOffset<winterOffset){stringToUTF8(winterName,std_name,17);stringToUTF8(summerName,dst_name,17)}else{stringToUTF8(winterName,dst_name,17);stringToUTF8(summerName,std_name,17)}};var _emscripten_date_now=()=>Date.now();var nowIsMonotonic=1;var checkWasiClock=clock_id=>clock_id>=0&&clock_id<=3;function _clock_time_get(clk_id,ignored_precision,ptime){ignored_precision=bigintToI53Checked(ignored_precision);if(!checkWasiClock(clk_id)){return 28}var now;if(clk_id===0){now=_emscripten_date_now()}else if(nowIsMonotonic){now=_emscripten_get_now()}else{return 52}var nsec=Math.round(now*1e3*1e3);HEAP64[ptime>>3]=BigInt(nsec);return 0}var _emscripten_err=str=>err(UTF8ToString(str));var getHeapMax=()=>2147483648;var _emscripten_get_heap_max=()=>getHeapMax();var _emscripten_has_asyncify=()=>1;var growMemory=size=>{var oldHeapSize=wasmMemory.buffer.byteLength;var pages=(size-oldHeapSize+65535)/65536|0;try{wasmMemory.grow(pages);updateMemoryViews();return 1}catch(e){err(`growMemory: Attempted to grow heap from ${oldHeapSize} bytes to ${size} bytes, but got error: ${e}`)}};var _emscripten_resize_heap=requestedSize=>{var oldSize=HEAPU8.length;requestedSize>>>=0;assert(requestedSize>oldSize);var maxHeapSize=getHeapMax();if(requestedSize>maxHeapSize){err(`Cannot enlarge memory, requested ${requestedSize} bytes, but the limit is ${maxHeapSize} bytes!`);return false}for(var cutDown=1;cutDown<=4;cutDown*=2){var overGrownHeapSize=oldSize*(1+.2/cutDown);overGrownHeapSize=Math.min(overGrownHeapSize,requestedSize+100663296);var newSize=Math.min(maxHeapSize,alignMemory(Math.max(requestedSize,overGrownHeapSize),65536));var replacement=growMemory(newSize);if(replacement){return true}}err(`Failed to grow the heap from ${oldSize} bytes to ${newSize} bytes, not enough memory!`);return false};var stackAlloc=sz=>__emscripten_stack_alloc(sz);var stringToUTF8OnStack=str=>{var size=lengthBytesUTF8(str)+1;var ret=stackAlloc(size);stringToUTF8(str,ret,size);return ret};var stringToNewUTF8=str=>{var size=lengthBytesUTF8(str)+1;var ret=_malloc(size);if(ret)stringToUTF8(str,ret,size);return ret};var WebGPU={Internals:{jsObjects:[],jsObjectInsert:(ptr,jsObject)=>{ptr>>>=0;WebGPU.Internals.jsObjects[ptr]=jsObject},bufferOnUnmaps:[],futures:[],futureInsert:(futureId,promise)=>{WebGPU.Internals.futures[futureId]=new Promise(resolve=>promise.finally(()=>resolve(futureId)))}},getJsObject:ptr=>{if(!ptr)return undefined;ptr>>>=0;assert(ptr in WebGPU.Internals.jsObjects);return WebGPU.Internals.jsObjects[ptr]},importJsAdapter:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateAdapter(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsBindGroup:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateBindGroup(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsBindGroupLayout:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateBindGroupLayout(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsBuffer:(buffer,parentPtr=0)=>{assert(buffer.mapState!="pending");var mapState=buffer.mapState=="mapped"?3:1;var bufferPtr=_emwgpuCreateBuffer(parentPtr,mapState);WebGPU.Internals.jsObjectInsert(bufferPtr,buffer);if(buffer.mapState=="mapped"){WebGPU.Internals.bufferOnUnmaps[bufferPtr]=[]}return bufferPtr},importJsCommandBuffer:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateCommandBuffer(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsCommandEncoder:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateCommandEncoder(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsComputePassEncoder:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateComputePassEncoder(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsComputePipeline:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateComputePipeline(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsDevice:(device,parentPtr=0)=>{var queuePtr=_emwgpuCreateQueue(parentPtr);var devicePtr=_emwgpuCreateDevice(parentPtr,queuePtr);WebGPU.Internals.jsObjectInsert(queuePtr,device.queue);WebGPU.Internals.jsObjectInsert(devicePtr,device);return devicePtr},importJsPipelineLayout:(obj,parentPtr=0)=>{var ptr=_emwgpuCreatePipelineLayout(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsQuerySet:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateQuerySet(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsQueue:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateQueue(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsRenderBundle:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateRenderBundle(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsRenderBundleEncoder:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateRenderBundleEncoder(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsRenderPassEncoder:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateRenderPassEncoder(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsRenderPipeline:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateRenderPipeline(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsSampler:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateSampler(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsShaderModule:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateShaderModule(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsSurface:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateSurface(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsTexture:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateTexture(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsTextureView:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateTextureView(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},errorCallback:(callback,type,message,userdata)=>{var sp=stackSave();var messagePtr=stringToUTF8OnStack(message);((a1,a2,a3)=>dynCall_viii(callback,a1,a2,a3))(type,messagePtr,userdata);stackRestore(sp)},setStringView:(ptr,data,length)=>{HEAPU32[ptr>>2]=data;HEAPU32[ptr+4>>2]=length},makeStringFromStringView:stringViewPtr=>{var ptr=HEAPU32[stringViewPtr>>2];var length=HEAPU32[stringViewPtr+4>>2];return UTF8ToString(ptr,length)},makeStringFromOptionalStringView:stringViewPtr=>{var ptr=HEAPU32[stringViewPtr>>2];var length=HEAPU32[stringViewPtr+4>>2];if(!ptr){if(length===0){return""}return undefined}return UTF8ToString(ptr,length)},makeColor:ptr=>({r:HEAPF64[ptr>>3],g:HEAPF64[ptr+8>>3],b:HEAPF64[ptr+16>>3],a:HEAPF64[ptr+24>>3]}),makeExtent3D:ptr=>({width:HEAPU32[ptr>>2],height:HEAPU32[ptr+4>>2],depthOrArrayLayers:HEAPU32[ptr+8>>2]}),makeOrigin3D:ptr=>({x:HEAPU32[ptr>>2],y:HEAPU32[ptr+4>>2],z:HEAPU32[ptr+8>>2]}),makeTexelCopyTextureInfo:ptr=>{assert(ptr);return{texture:WebGPU.getJsObject(HEAPU32[ptr>>2]),mipLevel:HEAPU32[ptr+4>>2],origin:WebGPU.makeOrigin3D(ptr+8),aspect:WebGPU.TextureAspect[HEAPU32[ptr+20>>2]]}},makeTexelCopyBufferLayout:ptr=>{var bytesPerRow=HEAPU32[ptr+8>>2];var rowsPerImage=HEAPU32[ptr+12>>2];return{offset:HEAPU32[ptr+4>>2]*4294967296+HEAPU32[ptr>>2],bytesPerRow:bytesPerRow===4294967295?undefined:bytesPerRow,rowsPerImage:rowsPerImage===4294967295?undefined:rowsPerImage}},makeTexelCopyBufferInfo:ptr=>{assert(ptr);var layoutPtr=ptr+0;var bufferCopyView=WebGPU.makeTexelCopyBufferLayout(layoutPtr);bufferCopyView["buffer"]=WebGPU.getJsObject(HEAPU32[ptr+16>>2]);return bufferCopyView},makePassTimestampWrites:ptr=>{if(ptr===0)return undefined;return{querySet:WebGPU.getJsObject(HEAPU32[ptr+4>>2]),beginningOfPassWriteIndex:HEAPU32[ptr+8>>2],endOfPassWriteIndex:HEAPU32[ptr+12>>2]}},makePipelineConstants:(constantCount,constantsPtr)=>{if(!constantCount)return;var constants={};for(var i=0;i<constantCount;++i){var entryPtr=constantsPtr+24*i;var key=WebGPU.makeStringFromStringView(entryPtr+4);constants[key]=HEAPF64[entryPtr+16>>3]}return constants},makePipelineLayout:layoutPtr=>{if(!layoutPtr)return"auto";return WebGPU.getJsObject(layoutPtr)},makeComputeState:ptr=>{if(!ptr)return undefined;assert(ptr);assert(HEAPU32[ptr>>2]===0);var desc={module:WebGPU.getJsObject(HEAPU32[ptr+4>>2]),constants:WebGPU.makePipelineConstants(HEAPU32[ptr+16>>2],HEAPU32[ptr+20>>2]),entryPoint:WebGPU.makeStringFromOptionalStringView(ptr+8)};return desc},makeComputePipelineDesc:descriptor=>{assert(descriptor);assert(HEAPU32[descriptor>>2]===0);var desc={label:WebGPU.makeStringFromOptionalStringView(descriptor+4),layout:WebGPU.makePipelineLayout(HEAPU32[descriptor+12>>2]),compute:WebGPU.makeComputeState(descriptor+16)};return desc},makeRenderPipelineDesc:descriptor=>{assert(descriptor);assert(HEAPU32[descriptor>>2]===0);function makePrimitiveState(psPtr){if(!psPtr)return undefined;assert(psPtr);assert(HEAPU32[psPtr>>2]===0);return{topology:WebGPU.PrimitiveTopology[HEAPU32[psPtr+4>>2]],stripIndexFormat:WebGPU.IndexFormat[HEAPU32[psPtr+8>>2]],frontFace:WebGPU.FrontFace[HEAPU32[psPtr+12>>2]],cullMode:WebGPU.CullMode[HEAPU32[psPtr+16>>2]],unclippedDepth:!!HEAPU32[psPtr+20>>2]}}function makeBlendComponent(bdPtr){if(!bdPtr)return undefined;return{operation:WebGPU.BlendOperation[HEAPU32[bdPtr>>2]],srcFactor:WebGPU.BlendFactor[HEAPU32[bdPtr+4>>2]],dstFactor:WebGPU.BlendFactor[HEAPU32[bdPtr+8>>2]]}}function makeBlendState(bsPtr){if(!bsPtr)return undefined;return{alpha:makeBlendComponent(bsPtr+12),color:makeBlendComponent(bsPtr+0)}}function makeColorState(csPtr){assert(csPtr);assert(HEAPU32[csPtr>>2]===0);var formatInt=HEAPU32[csPtr+4>>2];return formatInt===0?undefined:{format:WebGPU.TextureFormat[formatInt],blend:makeBlendState(HEAPU32[csPtr+8>>2]),writeMask:HEAPU32[csPtr+16>>2]}}function makeColorStates(count,csArrayPtr){var states=[];for(var i=0;i<count;++i){states.push(makeColorState(csArrayPtr+24*i))}return states}function makeStencilStateFace(ssfPtr){assert(ssfPtr);return{compare:WebGPU.CompareFunction[HEAPU32[ssfPtr>>2]],failOp:WebGPU.StencilOperation[HEAPU32[ssfPtr+4>>2]],depthFailOp:WebGPU.StencilOperation[HEAPU32[ssfPtr+8>>2]],passOp:WebGPU.StencilOperation[HEAPU32[ssfPtr+12>>2]]}}function makeDepthStencilState(dssPtr){if(!dssPtr)return undefined;assert(dssPtr);return{format:WebGPU.TextureFormat[HEAPU32[dssPtr+4>>2]],depthWriteEnabled:!!HEAPU32[dssPtr+8>>2],depthCompare:WebGPU.CompareFunction[HEAPU32[dssPtr+12>>2]],stencilFront:makeStencilStateFace(dssPtr+16),stencilBack:makeStencilStateFace(dssPtr+32),stencilReadMask:HEAPU32[dssPtr+48>>2],stencilWriteMask:HEAPU32[dssPtr+52>>2],depthBias:HEAP32[dssPtr+56>>2],depthBiasSlopeScale:HEAPF32[dssPtr+60>>2],depthBiasClamp:HEAPF32[dssPtr+64>>2]}}function makeVertexAttribute(vaPtr){assert(vaPtr);return{format:WebGPU.VertexFormat[HEAPU32[vaPtr+4>>2]],offset:HEAPU32[vaPtr+4+8>>2]*4294967296+HEAPU32[vaPtr+8>>2],shaderLocation:HEAPU32[vaPtr+16>>2]}}function makeVertexAttributes(count,vaArrayPtr){var vas=[];for(var i=0;i<count;++i){vas.push(makeVertexAttribute(vaArrayPtr+i*24))}return vas}function makeVertexBuffer(vbPtr){if(!vbPtr)return undefined;var stepModeInt=HEAPU32[vbPtr+4>>2];var attributeCountInt=HEAPU32[vbPtr+16>>2];if(stepModeInt===0&&attributeCountInt===0){return null}return{arrayStride:HEAPU32[vbPtr+4+8>>2]*4294967296+HEAPU32[vbPtr+8>>2],stepMode:WebGPU.VertexStepMode[stepModeInt],attributes:makeVertexAttributes(attributeCountInt,HEAPU32[vbPtr+20>>2])}}function makeVertexBuffers(count,vbArrayPtr){if(!count)return undefined;var vbs=[];for(var i=0;i<count;++i){vbs.push(makeVertexBuffer(vbArrayPtr+i*24))}return vbs}function makeVertexState(viPtr){if(!viPtr)return undefined;assert(viPtr);assert(HEAPU32[viPtr>>2]===0);var desc={module:WebGPU.getJsObject(HEAPU32[viPtr+4>>2]),constants:WebGPU.makePipelineConstants(HEAPU32[viPtr+16>>2],HEAPU32[viPtr+20>>2]),buffers:makeVertexBuffers(HEAPU32[viPtr+24>>2],HEAPU32[viPtr+28>>2]),entryPoint:WebGPU.makeStringFromOptionalStringView(viPtr+8)};return desc}function makeMultisampleState(msPtr){if(!msPtr)return undefined;assert(msPtr);assert(HEAPU32[msPtr>>2]===0);return{count:HEAPU32[msPtr+4>>2],mask:HEAPU32[msPtr+8>>2],alphaToCoverageEnabled:!!HEAPU32[msPtr+12>>2]}}function makeFragmentState(fsPtr){if(!fsPtr)return undefined;assert(fsPtr);assert(HEAPU32[fsPtr>>2]===0);var desc={module:WebGPU.getJsObject(HEAPU32[fsPtr+4>>2]),constants:WebGPU.makePipelineConstants(HEAPU32[fsPtr+16>>2],HEAPU32[fsPtr+20>>2]),targets:makeColorStates(HEAPU32[fsPtr+24>>2],HEAPU32[fsPtr+28>>2]),entryPoint:WebGPU.makeStringFromOptionalStringView(fsPtr+8)};return desc}var desc={label:WebGPU.makeStringFromOptionalStringView(descriptor+4),layout:WebGPU.makePipelineLayout(HEAPU32[descriptor+12>>2]),vertex:makeVertexState(descriptor+16),primitive:makePrimitiveState(descriptor+48),depthStencil:makeDepthStencilState(HEAPU32[descriptor+72>>2]),multisample:makeMultisampleState(descriptor+76),fragment:makeFragmentState(HEAPU32[descriptor+92>>2])};return desc},fillLimitStruct:(limits,limitsOutPtr)=>{assert(limitsOutPtr);assert(HEAPU32[limitsOutPtr>>2]===0);function setLimitValueU32(name,limitOffset){var limitValue=limits[name];HEAP32[limitsOutPtr+limitOffset>>2]=limitValue}function setLimitValueU64(name,limitOffset){var limitValue=limits[name];HEAP64[limitsOutPtr+limitOffset>>3]=BigInt(limitValue)}setLimitValueU32("maxTextureDimension1D",4);setLimitValueU32("maxTextureDimension2D",8);setLimitValueU32("maxTextureDimension3D",12);setLimitValueU32("maxTextureArrayLayers",16);setLimitValueU32("maxBindGroups",20);setLimitValueU32("maxBindGroupsPlusVertexBuffers",24);setLimitValueU32("maxBindingsPerBindGroup",28);setLimitValueU32("maxDynamicUniformBuffersPerPipelineLayout",32);setLimitValueU32("maxDynamicStorageBuffersPerPipelineLayout",36);setLimitValueU32("maxSampledTexturesPerShaderStage",40);setLimitValueU32("maxSamplersPerShaderStage",44);setLimitValueU32("maxStorageBuffersPerShaderStage",48);setLimitValueU32("maxStorageTexturesPerShaderStage",52);setLimitValueU32("maxUniformBuffersPerShaderStage",56);setLimitValueU32("minUniformBufferOffsetAlignment",80);setLimitValueU32("minStorageBufferOffsetAlignment",84);setLimitValueU64("maxUniformBufferBindingSize",64);setLimitValueU64("maxStorageBufferBindingSize",72);setLimitValueU32("maxVertexBuffers",88);setLimitValueU64("maxBufferSize",96);setLimitValueU32("maxVertexAttributes",104);setLimitValueU32("maxVertexBufferArrayStride",108);setLimitValueU32("maxInterStageShaderVariables",112);setLimitValueU32("maxColorAttachments",116);setLimitValueU32("maxColorAttachmentBytesPerSample",120);setLimitValueU32("maxComputeWorkgroupStorageSize",124);setLimitValueU32("maxComputeInvocationsPerWorkgroup",128);setLimitValueU32("maxComputeWorkgroupSizeX",132);setLimitValueU32("maxComputeWorkgroupSizeY",136);setLimitValueU32("maxComputeWorkgroupSizeZ",140);setLimitValueU32("maxComputeWorkgroupsPerDimension",144);if(limits.maxImmediateSize!==undefined){setLimitValueU32("maxImmediateSize",148)}},fillAdapterInfoStruct:(info,infoStruct)=>{assert(infoStruct);assert(HEAPU32[infoStruct>>2]===0);HEAP32[infoStruct+52>>2]=info.subgroupMinSize;HEAP32[infoStruct+56>>2]=info.subgroupMaxSize;var strs=info.vendor+info.architecture+info.device+info.description;var strPtr=stringToNewUTF8(strs);var vendorLen=lengthBytesUTF8(info.vendor);WebGPU.setStringView(infoStruct+4,strPtr,vendorLen);strPtr+=vendorLen;var architectureLen=lengthBytesUTF8(info.architecture);WebGPU.setStringView(infoStruct+12,strPtr,architectureLen);strPtr+=architectureLen;var deviceLen=lengthBytesUTF8(info.device);WebGPU.setStringView(infoStruct+20,strPtr,deviceLen);strPtr+=deviceLen;var descriptionLen=lengthBytesUTF8(info.description);WebGPU.setStringView(infoStruct+28,strPtr,descriptionLen);strPtr+=descriptionLen;HEAP32[infoStruct+36>>2]=2;var adapterType=info.isFallbackAdapter?3:4;HEAP32[infoStruct+40>>2]=adapterType;HEAP32[infoStruct+44>>2]=0;HEAP32[infoStruct+48>>2]=0},AddressMode:[,"clamp-to-edge","repeat","mirror-repeat"],BlendFactor:[,"zero","one","src","one-minus-src","src-alpha","one-minus-src-alpha","dst","one-minus-dst","dst-alpha","one-minus-dst-alpha","src-alpha-saturated","constant","one-minus-constant","src1","one-minus-src1","src1alpha","one-minus-src1alpha"],BlendOperation:[,"add","subtract","reverse-subtract","min","max"],BufferBindingType:["binding-not-used",,"uniform","storage","read-only-storage"],BufferMapState:[,"unmapped","pending","mapped"],CompareFunction:[,"never","less","equal","less-equal","greater","not-equal","greater-equal","always"],CompilationInfoRequestStatus:[,"success","callback-cancelled"],CompositeAlphaMode:[,"opaque","premultiplied","unpremultiplied","inherit"],CullMode:[,"none","front","back"],ErrorFilter:[,"validation","out-of-memory","internal"],FeatureLevel:[,"compatibility","core"],FeatureName:{1:"core-features-and-limits",2:"depth-clip-control",3:"depth32float-stencil8",4:"texture-compression-bc",5:"texture-compression-bc-sliced-3d",6:"texture-compression-etc2",7:"texture-compression-astc",8:"texture-compression-astc-sliced-3d",9:"timestamp-query",10:"indirect-first-instance",11:"shader-f16",12:"rg11b10ufloat-renderable",13:"bgra8unorm-storage",14:"float32-filterable",15:"float32-blendable",16:"clip-distances",17:"dual-source-blending",18:"subgroups",19:"texture-formats-tier1",20:"texture-formats-tier2",21:"primitive-index",327692:"chromium-experimental-unorm16-texture-formats",327693:"chromium-experimental-snorm16-texture-formats",327732:"chromium-experimental-multi-draw-indirect"},FilterMode:[,"nearest","linear"],FrontFace:[,"ccw","cw"],IndexFormat:[,"uint16","uint32"],InstanceFeatureName:[,"timed-wait-any","shader-source-spirv","multiple-devices-per-adapter"],LoadOp:[,"load","clear"],MipmapFilterMode:[,"nearest","linear"],OptionalBool:["false","true"],PowerPreference:[,"low-power","high-performance"],PredefinedColorSpace:[,"srgb","display-p3"],PrimitiveTopology:[,"point-list","line-list","line-strip","triangle-list","triangle-strip"],QueryType:[,"occlusion","timestamp"],SamplerBindingType:["binding-not-used",,"filtering","non-filtering","comparison"],Status:[,"success","error"],StencilOperation:[,"keep","zero","replace","invert","increment-clamp","decrement-clamp","increment-wrap","decrement-wrap"],StorageTextureAccess:["binding-not-used",,"write-only","read-only","read-write"],StoreOp:[,"store","discard"],SurfaceGetCurrentTextureStatus:[,"success-optimal","success-suboptimal","timeout","outdated","lost","error"],TextureAspect:[,"all","stencil-only","depth-only"],TextureDimension:[,"1d","2d","3d"],TextureFormat:[,"r8unorm","r8snorm","r8uint","r8sint","r16unorm","r16snorm","r16uint","r16sint","r16float","rg8unorm","rg8snorm","rg8uint","rg8sint","r32float","r32uint","r32sint","rg16unorm","rg16snorm","rg16uint","rg16sint","rg16float","rgba8unorm","rgba8unorm-srgb","rgba8snorm","rgba8uint","rgba8sint","bgra8unorm","bgra8unorm-srgb","rgb10a2uint","rgb10a2unorm","rg11b10ufloat","rgb9e5ufloat","rg32float","rg32uint","rg32sint","rgba16unorm","rgba16snorm","rgba16uint","rgba16sint","rgba16float","rgba32float","rgba32uint","rgba32sint","stencil8","depth16unorm","depth24plus","depth24plus-stencil8","depth32float","depth32float-stencil8","bc1-rgba-unorm","bc1-rgba-unorm-srgb","bc2-rgba-unorm","bc2-rgba-unorm-srgb","bc3-rgba-unorm","bc3-rgba-unorm-srgb","bc4-r-unorm","bc4-r-snorm","bc5-rg-unorm","bc5-rg-snorm","bc6h-rgb-ufloat","bc6h-rgb-float","bc7-rgba-unorm","bc7-rgba-unorm-srgb","etc2-rgb8unorm","etc2-rgb8unorm-srgb","etc2-rgb8a1unorm","etc2-rgb8a1unorm-srgb","etc2-rgba8unorm","etc2-rgba8unorm-srgb","eac-r11unorm","eac-r11snorm","eac-rg11unorm","eac-rg11snorm","astc-4x4-unorm","astc-4x4-unorm-srgb","astc-5x4-unorm","astc-5x4-unorm-srgb","astc-5x5-unorm","astc-5x5-unorm-srgb","astc-6x5-unorm","astc-6x5-unorm-srgb","astc-6x6-unorm","astc-6x6-unorm-srgb","astc-8x5-unorm","astc-8x5-unorm-srgb","astc-8x6-unorm","astc-8x6-unorm-srgb","astc-8x8-unorm","astc-8x8-unorm-srgb","astc-10x5-unorm","astc-10x5-unorm-srgb","astc-10x6-unorm","astc-10x6-unorm-srgb","astc-10x8-unorm","astc-10x8-unorm-srgb","astc-10x10-unorm","astc-10x10-unorm-srgb","astc-12x10-unorm","astc-12x10-unorm-srgb","astc-12x12-unorm","astc-12x12-unorm-srgb"],TextureSampleType:["binding-not-used",,"float","unfilterable-float","depth","sint","uint"],TextureViewDimension:[,"1d","2d","2d-array","cube","cube-array","3d"],ToneMappingMode:[,"standard","extended"],VertexFormat:[,"uint8","uint8x2","uint8x4","sint8","sint8x2","sint8x4","unorm8","unorm8x2","unorm8x4","snorm8","snorm8x2","snorm8x4","uint16","uint16x2","uint16x4","sint16","sint16x2","sint16x4","unorm16","unorm16x2","unorm16x4","snorm16","snorm16x2","snorm16x4","float16","float16x2","float16x4","float32","float32x2","float32x3","float32x4","uint32","uint32x2","uint32x3","uint32x4","sint32","sint32x2","sint32x3","sint32x4","unorm10-10-10-2","unorm8x4-bgra"],VertexStepMode:[,"vertex","instance"],WGSLLanguageFeatureName:[,"readonly_and_readwrite_storage_textures","packed_4x8_integer_dot_product","unrestricted_pointer_parameters","pointer_composite_access"]};var emwgpuStringToInt_DeviceLostReason={undefined:1,unknown:1,destroyed:2};function _emwgpuAdapterRequestDevice(adapterPtr,futureId,deviceLostFutureId,devicePtr,queuePtr,descriptor){futureId=bigintToI53Checked(futureId);deviceLostFutureId=bigintToI53Checked(deviceLostFutureId);var adapter=WebGPU.getJsObject(adapterPtr);var desc={};if(descriptor){assert(descriptor);assert(HEAPU32[descriptor>>2]===0);var requiredFeatureCount=HEAPU32[descriptor+12>>2];if(requiredFeatureCount){var requiredFeaturesPtr=HEAPU32[descriptor+16>>2];desc["requiredFeatures"]=Array.from(HEAPU32.subarray(requiredFeaturesPtr>>2,requiredFeaturesPtr+requiredFeatureCount*4>>2),feature=>WebGPU.FeatureName[feature])}var limitsPtr=HEAPU32[descriptor+20>>2];if(limitsPtr){assert(limitsPtr);assert(HEAPU32[limitsPtr>>2]===0);var requiredLimits={};function setLimitU32IfDefined(name,limitOffset,ignoreIfZero=false){var ptr=limitsPtr+limitOffset;var value=HEAPU32[ptr>>2];if(value!=4294967295&&(!ignoreIfZero||value!=0)){requiredLimits[name]=value}}function setLimitU64IfDefined(name,limitOffset){var ptr=limitsPtr+limitOffset;var limitPart1=HEAPU32[ptr>>2];var limitPart2=HEAPU32[ptr+4>>2];if(limitPart1!=4294967295||limitPart2!=4294967295){requiredLimits[name]=HEAPU32[ptr+4>>2]*4294967296+HEAPU32[ptr>>2]}}setLimitU32IfDefined("maxTextureDimension1D",4);setLimitU32IfDefined("maxTextureDimension2D",8);setLimitU32IfDefined("maxTextureDimension3D",12);setLimitU32IfDefined("maxTextureArrayLayers",16);setLimitU32IfDefined("maxBindGroups",20);setLimitU32IfDefined("maxBindGroupsPlusVertexBuffers",24);setLimitU32IfDefined("maxDynamicUniformBuffersPerPipelineLayout",32);setLimitU32IfDefined("maxDynamicStorageBuffersPerPipelineLayout",36);setLimitU32IfDefined("maxSampledTexturesPerShaderStage",40);setLimitU32IfDefined("maxSamplersPerShaderStage",44);setLimitU32IfDefined("maxStorageBuffersPerShaderStage",48);setLimitU32IfDefined("maxStorageTexturesPerShaderStage",52);setLimitU32IfDefined("maxUniformBuffersPerShaderStage",56);setLimitU32IfDefined("minUniformBufferOffsetAlignment",80);setLimitU32IfDefined("minStorageBufferOffsetAlignment",84);setLimitU64IfDefined("maxUniformBufferBindingSize",64);setLimitU64IfDefined("maxStorageBufferBindingSize",72);setLimitU32IfDefined("maxVertexBuffers",88);setLimitU64IfDefined("maxBufferSize",96);setLimitU32IfDefined("maxVertexAttributes",104);setLimitU32IfDefined("maxVertexBufferArrayStride",108);setLimitU32IfDefined("maxInterStageShaderVariables",112);setLimitU32IfDefined("maxColorAttachments",116);setLimitU32IfDefined("maxColorAttachmentBytesPerSample",120);setLimitU32IfDefined("maxComputeWorkgroupStorageSize",124);setLimitU32IfDefined("maxComputeInvocationsPerWorkgroup",128);setLimitU32IfDefined("maxComputeWorkgroupSizeX",132);setLimitU32IfDefined("maxComputeWorkgroupSizeY",136);setLimitU32IfDefined("maxComputeWorkgroupSizeZ",140);setLimitU32IfDefined("maxComputeWorkgroupsPerDimension",144);setLimitU32IfDefined("maxImmediateSize",148,true);desc["requiredLimits"]=requiredLimits}var defaultQueuePtr=HEAPU32[descriptor+24>>2];if(defaultQueuePtr){var defaultQueueDesc={label:WebGPU.makeStringFromOptionalStringView(defaultQueuePtr+4)};desc["defaultQueue"]=defaultQueueDesc}desc["label"]=WebGPU.makeStringFromOptionalStringView(descriptor+4)}WebGPU.Internals.futureInsert(futureId,adapter.requestDevice(desc).then(device=>{callUserCallback(()=>{WebGPU.Internals.jsObjectInsert(queuePtr,device.queue);WebGPU.Internals.jsObjectInsert(devicePtr,device);assert(deviceLostFutureId);WebGPU.Internals.futureInsert(deviceLostFutureId,device.lost.then(info=>{callUserCallback(()=>{device.onuncapturederror=ev=>{};var sp=stackSave();var messagePtr=stringToUTF8OnStack(info.message);_emwgpuOnDeviceLostCompleted(deviceLostFutureId,emwgpuStringToInt_DeviceLostReason[info.reason],messagePtr);stackRestore(sp)})}));assert(typeof GPUValidationError!="undefined");assert(typeof GPUOutOfMemoryError!="undefined");assert(typeof GPUInternalError!="undefined");device.onuncapturederror=ev=>{var type=5;if(ev.error instanceof GPUValidationError)type=2;else if(ev.error instanceof GPUOutOfMemoryError)type=3;else if(ev.error instanceof GPUInternalError)type=4;var sp=stackSave();var messagePtr=stringToUTF8OnStack(ev.error.message);_emwgpuOnUncapturedError(devicePtr,type,messagePtr);stackRestore(sp)};_emwgpuOnRequestDeviceCompleted(futureId,1,devicePtr,0)})},ex=>{callUserCallback(()=>{var sp=stackSave();var messagePtr=stringToUTF8OnStack(ex.message);_emwgpuOnRequestDeviceCompleted(futureId,3,devicePtr,messagePtr);if(deviceLostFutureId){_emwgpuOnDeviceLostCompleted(deviceLostFutureId,4,messagePtr)}stackRestore(sp)})}))}var _emwgpuBufferDestroy=bufferPtr=>{var buffer=WebGPU.getJsObject(bufferPtr);var onUnmap=WebGPU.Internals.bufferOnUnmaps[bufferPtr];if(onUnmap){for(var i=0;i<onUnmap.length;++i){onUnmap[i]()}delete WebGPU.Internals.bufferOnUnmaps[bufferPtr]}buffer.destroy()};var _emwgpuBufferGetConstMappedRange=(bufferPtr,offset,size)=>{var buffer=WebGPU.getJsObject(bufferPtr);if(size===0)warnOnce("getMappedRange size=0 no longer means WGPU_WHOLE_MAP_SIZE");if(size==-1)size=undefined;var mapped;try{mapped=buffer.getMappedRange(offset,size)}catch(ex){err(`buffer.getMappedRange(${offset}, ${size}) failed: ${ex}`);return 0}var data=_memalign(16,mapped.byteLength);HEAPU8.set(new Uint8Array(mapped),data);WebGPU.Internals.bufferOnUnmaps[bufferPtr].push(()=>_free(data));return data};var _emwgpuBufferGetMappedRange=(bufferPtr,offset,size)=>{var buffer=WebGPU.getJsObject(bufferPtr);if(size===0)warnOnce("getMappedRange size=0 no longer means WGPU_WHOLE_MAP_SIZE");if(size==-1)size=undefined;var mapped;try{mapped=buffer.getMappedRange(offset,size)}catch(ex){err(`buffer.getMappedRange(${offset}, ${size}) failed: ${ex}`);return 0}var data=_memalign(16,mapped.byteLength);HEAPU8.fill(0,data,mapped.byteLength);WebGPU.Internals.bufferOnUnmaps[bufferPtr].push(()=>{new Uint8Array(mapped).set(HEAPU8.subarray(data,data+mapped.byteLength));_free(data)});return data};var _emwgpuBufferMapAsync=function(bufferPtr,futureId,mode,offset,size){futureId=bigintToI53Checked(futureId);mode=bigintToI53Checked(mode);var buffer=WebGPU.getJsObject(bufferPtr);WebGPU.Internals.bufferOnUnmaps[bufferPtr]=[];if(size==-1)size=undefined;WebGPU.Internals.futureInsert(futureId,buffer.mapAsync(mode,offset,size).then(()=>{callUserCallback(()=>{_emwgpuOnMapAsyncCompleted(futureId,1,0)})},ex=>{callUserCallback(()=>{var sp=stackSave();var messagePtr=stringToUTF8OnStack(ex.message);var status=ex.name==="AbortError"?4:ex.name==="OperationError"?3:0;assert(status);_emwgpuOnMapAsyncCompleted(futureId,status,messagePtr);delete WebGPU.Internals.bufferOnUnmaps[bufferPtr]})}))};var _emwgpuBufferUnmap=bufferPtr=>{var buffer=WebGPU.getJsObject(bufferPtr);var onUnmap=WebGPU.Internals.bufferOnUnmaps[bufferPtr];if(!onUnmap){return}for(var i=0;i<onUnmap.length;++i){onUnmap[i]()}delete WebGPU.Internals.bufferOnUnmaps[bufferPtr];buffer.unmap()};var _emwgpuDelete=ptr=>{delete WebGPU.Internals.jsObjects[ptr]};var _emwgpuDeviceCreateBuffer=(devicePtr,descriptor,bufferPtr)=>{assert(descriptor);assert(HEAPU32[descriptor>>2]===0);var mappedAtCreation=!!HEAPU32[descriptor+32>>2];var desc={label:WebGPU.makeStringFromOptionalStringView(descriptor+4),usage:HEAPU32[descriptor+16>>2],size:HEAPU32[descriptor+4+24>>2]*4294967296+HEAPU32[descriptor+24>>2],mappedAtCreation};var device=WebGPU.getJsObject(devicePtr);var buffer;try{buffer=device.createBuffer(desc)}catch(ex){assert(ex instanceof RangeError);assert(mappedAtCreation);err("createBuffer threw:",ex);return false}WebGPU.Internals.jsObjectInsert(bufferPtr,buffer);if(mappedAtCreation){WebGPU.Internals.bufferOnUnmaps[bufferPtr]=[]}return true};var _emwgpuDeviceCreateShaderModule=(devicePtr,descriptor,shaderModulePtr)=>{assert(descriptor);var nextInChainPtr=HEAPU32[descriptor>>2];assert(nextInChainPtr!==0);var sType=HEAPU32[nextInChainPtr+4>>2];var desc={label:WebGPU.makeStringFromOptionalStringView(descriptor+4),code:""};switch(sType){case 2:{desc["code"]=WebGPU.makeStringFromStringView(nextInChainPtr+8);break}default:abort("unrecognized ShaderModule sType")}var device=WebGPU.getJsObject(devicePtr);WebGPU.Internals.jsObjectInsert(shaderModulePtr,device.createShaderModule(desc))};var _emwgpuDeviceDestroy=devicePtr=>{const device=WebGPU.getJsObject(devicePtr);device.onuncapturederror=null;device.destroy()};function _emwgpuInstanceRequestAdapter(instancePtr,futureId,options,adapterPtr){futureId=bigintToI53Checked(futureId);var opts;if(options){assert(options);var featureLevel=HEAPU32[options+4>>2];opts={featureLevel:WebGPU.FeatureLevel[featureLevel],powerPreference:WebGPU.PowerPreference[HEAPU32[options+8>>2]],forceFallbackAdapter:!!HEAPU32[options+12>>2]};var nextInChainPtr=HEAPU32[options>>2];if(nextInChainPtr!==0){var sType=HEAPU32[nextInChainPtr+4>>2];assert(sType===11);assert(0===HEAPU32[nextInChainPtr>>2]);var webxrOptions=nextInChainPtr;assert(webxrOptions);assert(HEAPU32[webxrOptions>>2]===0);opts.xrCompatible=!!HEAPU32[webxrOptions+8>>2]}}if(!("gpu"in navigator)){var sp=stackSave();var messagePtr=stringToUTF8OnStack("WebGPU not available on this browser (navigator.gpu is not available)");_emwgpuOnRequestAdapterCompleted(futureId,3,adapterPtr,messagePtr);stackRestore(sp);return}WebGPU.Internals.futureInsert(futureId,navigator.gpu.requestAdapter(opts).then(adapter=>{callUserCallback(()=>{if(adapter){WebGPU.Internals.jsObjectInsert(adapterPtr,adapter);_emwgpuOnRequestAdapterCompleted(futureId,1,adapterPtr,0)}else{var sp=stackSave();var messagePtr=stringToUTF8OnStack("WebGPU not available on this browser (requestAdapter returned null)");_emwgpuOnRequestAdapterCompleted(futureId,3,adapterPtr,messagePtr);stackRestore(sp)}})},ex=>{callUserCallback(()=>{var sp=stackSave();var messagePtr=stringToUTF8OnStack(ex.message);_emwgpuOnRequestAdapterCompleted(futureId,4,adapterPtr,messagePtr);stackRestore(sp)})}))}var _emwgpuQueueOnSubmittedWorkDone=function(queuePtr,futureId){futureId=bigintToI53Checked(futureId);var queue=WebGPU.getJsObject(queuePtr);WebGPU.Internals.futureInsert(futureId,queue.onSubmittedWorkDone().then(()=>{callUserCallback(()=>{_emwgpuOnWorkDoneCompleted(futureId,1)})}))};var _emwgpuWaitAny=(futurePtr,futureCount,timeoutMSPtr)=>Asyncify.handleAsync(async()=>{var promises=[];if(timeoutMSPtr){var timeoutMS=HEAP32[timeoutMSPtr>>2];promises.length=futureCount+1;promises[futureCount]=new Promise(resolve=>setTimeout(resolve,timeoutMS,0))}else{promises.length=futureCount}for(var i=0;i<futureCount;++i){var futureId=HEAPU32[futurePtr+i*8+4>>2]*4294967296+HEAPU32[futurePtr+i*8>>2];if(!(futureId in WebGPU.Internals.futures)){return futureId}promises[i]=WebGPU.Internals.futures[futureId]}const firstResolvedFuture=await Promise.race(promises);delete WebGPU.Internals.futures[firstResolvedFuture];return firstResolvedFuture});_emwgpuWaitAny.isAsync=true;var ENV={};var getExecutableName=()=>thisProgram||"./this.program";var getEnvStrings=()=>{if(!getEnvStrings.strings){var lang=(globalThis.navigator?.language??"C").replace("-","_")+".UTF-8";var env={USER:"web_user",LOGNAME:"web_user",PATH:"/",PWD:"/",HOME:"/home/web_user",LANG:lang,_:getExecutableName()};for(var x in ENV){if(ENV[x]===undefined)delete env[x];else env[x]=ENV[x]}var strings=[];for(var x in env){strings.push(`${x}=${env[x]}`)}getEnvStrings.strings=strings}return getEnvStrings.strings};var _environ_get=(__environ,environ_buf)=>{var bufSize=0;var envp=0;for(var string of getEnvStrings()){var ptr=environ_buf+bufSize;HEAPU32[__environ+envp>>2]=ptr;bufSize+=stringToUTF8(string,ptr,Infinity)+1;envp+=4}return 0};var _environ_sizes_get=(penviron_count,penviron_buf_size)=>{var strings=getEnvStrings();HEAPU32[penviron_count>>2]=strings.length;var bufSize=0;for(var string of strings){bufSize+=lengthBytesUTF8(string)+1}HEAPU32[penviron_buf_size>>2]=bufSize;return 0};function _fd_close(fd){try{var stream=SYSCALLS.getStreamFromFD(fd);FS.close(stream);return 0}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return e.errno}}var doReadv=(stream,iov,iovcnt,offset)=>{var ret=0;for(var i=0;i<iovcnt;i++){var ptr=HEAPU32[iov>>2];var len=HEAPU32[iov+4>>2];iov+=8;var curr=FS.read(stream,HEAP8,ptr,len,offset);if(curr<0)return-1;ret+=curr;if(curr<len)break;if(typeof offset!="undefined"){offset+=curr}}return ret};function _fd_read(fd,iov,iovcnt,pnum){try{var stream=SYSCALLS.getStreamFromFD(fd);var num=doReadv(stream,iov,iovcnt);HEAPU32[pnum>>2]=num;return 0}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return e.errno}}function _fd_seek(fd,offset,whence,newOffset){offset=bigintToI53Checked(offset);try{if(isNaN(offset))return 61;var stream=SYSCALLS.getStreamFromFD(fd);FS.llseek(stream,offset,whence);HEAP64[newOffset>>3]=BigInt(stream.position);if(stream.getdents&&offset===0&&whence===0)stream.getdents=null;return 0}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return e.errno}}var doWritev=(stream,iov,iovcnt,offset)=>{var ret=0;for(var i=0;i<iovcnt;i++){var ptr=HEAPU32[iov>>2];var len=HEAPU32[iov+4>>2];iov+=8;var curr=FS.write(stream,HEAP8,ptr,len,offset);if(curr<0)return-1;ret+=curr;if(curr<len){break}if(typeof offset!="undefined"){offset+=curr}}return ret};function _fd_write(fd,iov,iovcnt,pnum){try{var stream=SYSCALLS.getStreamFromFD(fd);var num=doWritev(stream,iov,iovcnt);HEAPU32[pnum>>2]=num;return 0}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return e.errno}}var _random_get=(buffer,size)=>randomFill(HEAPU8.subarray(buffer,buffer+size));var emwgpuStringToInt_FeatureName={"core-features-and-limits":1,"depth-clip-control":2,"depth32float-stencil8":3,"texture-compression-bc":4,"texture-compression-bc-sliced-3d":5,"texture-compression-etc2":6,"texture-compression-astc":7,"texture-compression-astc-sliced-3d":8,"timestamp-query":9,"indirect-first-instance":10,"shader-f16":11,"rg11b10ufloat-renderable":12,"bgra8unorm-storage":13,"float32-filterable":14,"float32-blendable":15,"clip-distances":16,"dual-source-blending":17,subgroups:18,"texture-formats-tier1":19,"texture-formats-tier2":20,"primitive-index":21,"chromium-experimental-unorm16-texture-formats":327692,"chromium-experimental-snorm16-texture-formats":327693,"chromium-experimental-multi-draw-indirect":327732};var _wgpuAdapterGetFeatures=(adapterPtr,supportedFeatures)=>{var adapter=WebGPU.getJsObject(adapterPtr);var featuresPtr=_malloc(adapter.features.size*4);var offset=0;var numFeatures=0;for(const feature of adapter.features){var featureEnumValue=emwgpuStringToInt_FeatureName[feature];if(featureEnumValue>=0){HEAP32[featuresPtr+offset>>2]=featureEnumValue;offset+=4;numFeatures++}}HEAPU32[supportedFeatures+4>>2]=featuresPtr;HEAPU32[supportedFeatures>>2]=numFeatures};var _wgpuAdapterGetInfo=(adapterPtr,info)=>{var adapter=WebGPU.getJsObject(adapterPtr);WebGPU.fillAdapterInfoStruct(adapter.info,info);return 1};var _wgpuAdapterGetLimits=(adapterPtr,limitsOutPtr)=>{var adapter=WebGPU.getJsObject(adapterPtr);WebGPU.fillLimitStruct(adapter.limits,limitsOutPtr);return 1};var _wgpuAdapterHasFeature=(adapterPtr,featureEnumValue)=>{var adapter=WebGPU.getJsObject(adapterPtr);return adapter.features.has(WebGPU.FeatureName[featureEnumValue])};var _wgpuBufferGetSize=function(bufferPtr){var ret=(()=>{var buffer=WebGPU.getJsObject(bufferPtr);return buffer.size})();return BigInt(ret)};var _wgpuCommandEncoderBeginComputePass=(encoderPtr,descriptor)=>{var desc;if(descriptor){assert(descriptor);assert(HEAPU32[descriptor>>2]===0);desc={label:WebGPU.makeStringFromOptionalStringView(descriptor+4),timestampWrites:WebGPU.makePassTimestampWrites(HEAPU32[descriptor+12>>2])}}var commandEncoder=WebGPU.getJsObject(encoderPtr);var ptr=_emwgpuCreateComputePassEncoder(0);WebGPU.Internals.jsObjectInsert(ptr,commandEncoder.beginComputePass(desc));return ptr};function _wgpuCommandEncoderCopyBufferToBuffer(encoderPtr,srcPtr,srcOffset,dstPtr,dstOffset,size){srcOffset=bigintToI53Checked(srcOffset);dstOffset=bigintToI53Checked(dstOffset);size=bigintToI53Checked(size);var commandEncoder=WebGPU.getJsObject(encoderPtr);var src=WebGPU.getJsObject(srcPtr);var dst=WebGPU.getJsObject(dstPtr);commandEncoder.copyBufferToBuffer(src,srcOffset,dst,dstOffset,size)}var _wgpuCommandEncoderFinish=(encoderPtr,descriptor)=>{var commandEncoder=WebGPU.getJsObject(encoderPtr);var ptr=_emwgpuCreateCommandBuffer(0);WebGPU.Internals.jsObjectInsert(ptr,commandEncoder.finish());return ptr};var _wgpuComputePassEncoderDispatchWorkgroups=(passPtr,x,y,z)=>{assert(x>=0);assert(y>=0);assert(z>=0);var pass=WebGPU.getJsObject(passPtr);pass.dispatchWorkgroups(x,y,z)};var _wgpuComputePassEncoderEnd=passPtr=>{var pass=WebGPU.getJsObject(passPtr);pass.end()};var _wgpuComputePassEncoderSetBindGroup=(passPtr,groupIndex,groupPtr,dynamicOffsetCount,dynamicOffsetsPtr)=>{assert(groupIndex>=0);var pass=WebGPU.getJsObject(passPtr);var group=WebGPU.getJsObject(groupPtr);if(dynamicOffsetCount==0){pass.setBindGroup(groupIndex,group)}else{pass.setBindGroup(groupIndex,group,HEAPU32,dynamicOffsetsPtr>>2,dynamicOffsetCount)}};var _wgpuComputePassEncoderSetPipeline=(passPtr,pipelinePtr)=>{var pass=WebGPU.getJsObject(passPtr);var pipeline=WebGPU.getJsObject(pipelinePtr);pass.setPipeline(pipeline)};var _wgpuComputePipelineGetBindGroupLayout=(pipelinePtr,groupIndex)=>{assert(groupIndex>=0);var pipeline=WebGPU.getJsObject(pipelinePtr);var ptr=_emwgpuCreateBindGroupLayout(0);WebGPU.Internals.jsObjectInsert(ptr,pipeline.getBindGroupLayout(groupIndex));return ptr};var readI53FromI64=ptr=>HEAPU32[ptr>>2]+HEAP32[ptr+4>>2]*4294967296;var _wgpuDeviceCreateBindGroup=(devicePtr,descriptor)=>{assert(descriptor);assert(HEAPU32[descriptor>>2]===0);function makeEntry(entryPtr){assert(entryPtr);var bufferPtr=HEAPU32[entryPtr+8>>2];var samplerPtr=HEAPU32[entryPtr+32>>2];var textureViewPtr=HEAPU32[entryPtr+36>>2];assert((bufferPtr!==0)+(samplerPtr!==0)+(textureViewPtr!==0)===1);var binding=HEAPU32[entryPtr+4>>2];if(bufferPtr){var size=readI53FromI64(entryPtr+24);if(size==-1)size=undefined;return{binding,resource:{buffer:WebGPU.getJsObject(bufferPtr),offset:HEAPU32[entryPtr+4+16>>2]*4294967296+HEAPU32[entryPtr+16>>2],size}}}else if(samplerPtr){return{binding,resource:WebGPU.getJsObject(samplerPtr)}}else{return{binding,resource:WebGPU.getJsObject(textureViewPtr)}}}function makeEntries(count,entriesPtrs){var entries=[];for(var i=0;i<count;++i){entries.push(makeEntry(entriesPtrs+40*i))}return entries}var desc={label:WebGPU.makeStringFromOptionalStringView(descriptor+4),layout:WebGPU.getJsObject(HEAPU32[descriptor+12>>2]),entries:makeEntries(HEAPU32[descriptor+16>>2],HEAPU32[descriptor+20>>2])};var device=WebGPU.getJsObject(devicePtr);var ptr=_emwgpuCreateBindGroup(0);WebGPU.Internals.jsObjectInsert(ptr,device.createBindGroup(desc));return ptr};var _wgpuDeviceCreateCommandEncoder=(devicePtr,descriptor)=>{var desc;if(descriptor){assert(descriptor);assert(HEAPU32[descriptor>>2]===0);desc={label:WebGPU.makeStringFromOptionalStringView(descriptor+4)}}var device=WebGPU.getJsObject(devicePtr);var ptr=_emwgpuCreateCommandEncoder(0);WebGPU.Internals.jsObjectInsert(ptr,device.createCommandEncoder(desc));return ptr};var _wgpuDeviceCreateComputePipeline=(devicePtr,descriptor)=>{var desc=WebGPU.makeComputePipelineDesc(descriptor);var device=WebGPU.getJsObject(devicePtr);var ptr=_emwgpuCreateComputePipeline(0);WebGPU.Internals.jsObjectInsert(ptr,device.createComputePipeline(desc));return ptr};var _wgpuQueueSubmit=(queuePtr,commandCount,commands)=>{assert(commands%4===0);var queue=WebGPU.getJsObject(queuePtr);var cmds=Array.from(HEAP32.subarray(commands>>2,commands+commandCount*4>>2),id=>WebGPU.getJsObject(id));queue.submit(cmds)};function _wgpuQueueWriteBuffer(queuePtr,bufferPtr,bufferOffset,data,size){bufferOffset=bigintToI53Checked(bufferOffset);var queue=WebGPU.getJsObject(queuePtr);var buffer=WebGPU.getJsObject(bufferPtr);var subarray=HEAPU8.subarray(data,data+size);queue.writeBuffer(buffer,bufferOffset,subarray,0,size)}var runAndAbortIfError=func=>{try{return func()}catch(e){abort(e)}};var createNamedFunction=(name,func)=>Object.defineProperty(func,"name",{value:name});var runtimeKeepalivePush=()=>{runtimeKeepaliveCounter+=1};var runtimeKeepalivePop=()=>{assert(runtimeKeepaliveCounter>0);runtimeKeepaliveCounter-=1};var Asyncify={instrumentWasmImports(imports){var importPattern=/^(invoke_.*|__asyncjs__.*)$/;for(let[x,original]of Object.entries(imports)){if(typeof original=="function"){let isAsyncifyImport=original.isAsync||importPattern.test(x);imports[x]=(...args)=>{var originalAsyncifyState=Asyncify.state;try{return original(...args)}finally{var changedToDisabled=originalAsyncifyState===Asyncify.State.Normal&&Asyncify.state===Asyncify.State.Disabled;var ignoredInvoke=x.startsWith("invoke_")&&true;if(Asyncify.state!==originalAsyncifyState&&!isAsyncifyImport&&!changedToDisabled&&!ignoredInvoke){abort(`import ${x} was not in ASYNCIFY_IMPORTS, but changed the state`)}}}}}},instrumentFunction(original){var wrapper=(...args)=>{Asyncify.exportCallStack.push(original);try{return original(...args)}finally{if(!ABORT){var top=Asyncify.exportCallStack.pop();assert(top===original);Asyncify.maybeStopUnwind()}}};Asyncify.funcWrappers.set(original,wrapper);wrapper=createNamedFunction(`__asyncify_wrapper_${original.name}`,wrapper);return wrapper},instrumentWasmExports(exports){var ret={};for(let[x,original]of Object.entries(exports)){if(typeof original=="function"){var wrapper=Asyncify.instrumentFunction(original);ret[x]=wrapper}else{ret[x]=original}}return ret},State:{Normal:0,Unwinding:1,Rewinding:2,Disabled:3},state:0,StackSize:4096,currData:null,handleSleepReturnValue:0,exportCallStack:[],callstackFuncToId:new Map,callStackIdToFunc:new Map,funcWrappers:new Map,callStackId:0,asyncPromiseHandlers:null,sleepCallbacks:[],getCallStackId(func){assert(func);if(!Asyncify.callstackFuncToId.has(func)){var id=Asyncify.callStackId++;Asyncify.callstackFuncToId.set(func,id);Asyncify.callStackIdToFunc.set(id,func)}return Asyncify.callstackFuncToId.get(func)},maybeStopUnwind(){if(Asyncify.currData&&Asyncify.state===Asyncify.State.Unwinding&&Asyncify.exportCallStack.length===0){Asyncify.state=Asyncify.State.Normal;runAndAbortIfError(_asyncify_stop_unwind);if(typeof Fibers!="undefined"){Fibers.trampoline()}}},whenDone(){assert(Asyncify.currData,"Tried to wait for an async operation when none is in progress.");assert(!Asyncify.asyncPromiseHandlers,"Cannot have multiple async operations in flight at once");return new Promise((resolve,reject)=>{Asyncify.asyncPromiseHandlers={resolve,reject}})},allocateData(){var ptr=_malloc(12+Asyncify.StackSize);Asyncify.setDataHeader(ptr,ptr+12,Asyncify.StackSize);Asyncify.setDataRewindFunc(ptr);return ptr},setDataHeader(ptr,stack,stackSize){HEAPU32[ptr>>2]=stack;HEAPU32[ptr+4>>2]=stack+stackSize},setDataRewindFunc(ptr){var bottomOfCallStack=Asyncify.exportCallStack[0];assert(bottomOfCallStack,"exportCallStack is empty");var rewindId=Asyncify.getCallStackId(bottomOfCallStack);HEAP32[ptr+8>>2]=rewindId},getDataRewindFunc(ptr){var id=HEAP32[ptr+8>>2];var func=Asyncify.callStackIdToFunc.get(id);assert(func,`id ${id} not found in callStackIdToFunc`);return func},doRewind(ptr){var original=Asyncify.getDataRewindFunc(ptr);var func=Asyncify.funcWrappers.get(original);assert(original);assert(func);return callUserCallback(func)},handleSleep(startAsync){assert(Asyncify.state!==Asyncify.State.Disabled,"Asyncify cannot be done during or after the runtime exits");if(ABORT)return;if(Asyncify.state===Asyncify.State.Normal){var reachedCallback=false;var reachedAfterCallback=false;startAsync((handleSleepReturnValue=0)=>{assert(["undefined","number","boolean","bigint"].includes(typeof handleSleepReturnValue),`invalid type for handleSleepReturnValue: \'${typeof handleSleepReturnValue}\'`);if(ABORT)return;Asyncify.handleSleepReturnValue=handleSleepReturnValue;reachedCallback=true;if(!reachedAfterCallback){return}assert(!Asyncify.exportCallStack.length,"Waking up (starting to rewind) must be done from JS, without compiled code on the stack.");Asyncify.state=Asyncify.State.Rewinding;runAndAbortIfError(()=>_asyncify_start_rewind(Asyncify.currData));if(typeof MainLoop!="undefined"&&MainLoop.func){MainLoop.resume()}var asyncWasmReturnValue,isError=false;try{asyncWasmReturnValue=Asyncify.doRewind(Asyncify.currData)}catch(err){asyncWasmReturnValue=err;isError=true}var handled=false;if(!Asyncify.currData){var asyncPromiseHandlers=Asyncify.asyncPromiseHandlers;if(asyncPromiseHandlers){Asyncify.asyncPromiseHandlers=null;(isError?asyncPromiseHandlers.reject:asyncPromiseHandlers.resolve)(asyncWasmReturnValue);handled=true}}if(isError&&!handled){throw asyncWasmReturnValue}});reachedAfterCallback=true;if(!reachedCallback){Asyncify.state=Asyncify.State.Unwinding;Asyncify.currData=Asyncify.allocateData();if(typeof MainLoop!="undefined"&&MainLoop.func){MainLoop.pause()}runAndAbortIfError(()=>_asyncify_start_unwind(Asyncify.currData))}}else if(Asyncify.state===Asyncify.State.Rewinding){Asyncify.state=Asyncify.State.Normal;runAndAbortIfError(_asyncify_stop_rewind);_free(Asyncify.currData);Asyncify.currData=null;Asyncify.sleepCallbacks.forEach(callUserCallback)}else{abort(`invalid state: ${Asyncify.state}`)}return Asyncify.handleSleepReturnValue},handleAsync:startAsync=>Asyncify.handleSleep(async wakeUp=>{wakeUp(await startAsync())})};var getCFunc=ident=>{var func=Module["_"+ident];assert(func,`Cannot call unknown function ${ident}, make sure it is exported`);return func};var writeArrayToMemory=(array,buffer)=>{assert(array.length>=0,"writeArrayToMemory array must have a length (should be an array or typed array)");HEAP8.set(array,buffer)};var ccall=(ident,returnType,argTypes,args,opts)=>{var toC={string:str=>{var ret=0;if(str!==null&&str!==undefined&&str!==0){ret=stringToUTF8OnStack(str)}return ret},array:arr=>{var ret=stackAlloc(arr.length);writeArrayToMemory(arr,ret);return ret}};function convertReturnValue(ret){if(returnType==="string"){return UTF8ToString(ret)}if(returnType==="boolean")return Boolean(ret);return ret}var func=getCFunc(ident);var cArgs=[];var stack=0;assert(returnType!=="array",\'Return type should not be "array".\');if(args){for(var i=0;i<args.length;i++){var converter=toC[argTypes[i]];if(converter){if(stack===0)stack=stackSave();cArgs[i]=converter(args[i])}else{cArgs[i]=args[i]}}}var previousAsync=Asyncify.currData;var ret=func(...cArgs);function onDone(ret){runtimeKeepalivePop();if(stack!==0)stackRestore(stack);return convertReturnValue(ret)}var asyncMode=opts?.async;runtimeKeepalivePush();if(Asyncify.currData!=previousAsync){assert(!(previousAsync&&Asyncify.currData),"We cannot start an async operation when one is already in flight");assert(!(previousAsync&&!Asyncify.currData),"We cannot stop an async operation in flight");assert(asyncMode,`The call to ${ident} is running asynchronously. If this was intended, add the async option to the ccall/cwrap call.`);return Asyncify.whenDone().then(onDone)}ret=onDone(ret);if(asyncMode)return Promise.resolve(ret);return ret};var cwrap=(ident,returnType,argTypes,opts)=>(...args)=>ccall(ident,returnType,argTypes,args,opts);var FS_createPath=(...args)=>FS.createPath(...args);var FS_unlink=(...args)=>FS.unlink(...args);var FS_createLazyFile=(...args)=>FS.createLazyFile(...args);var FS_createDevice=(...args)=>FS.createDevice(...args);FS.createPreloadedFile=FS_createPreloadedFile;FS.preloadFile=FS_preloadFile;FS.staticInit();{initMemory();if(Module["noExitRuntime"])noExitRuntime=Module["noExitRuntime"];if(Module["preloadPlugins"])preloadPlugins=Module["preloadPlugins"];if(Module["print"])out=Module["print"];if(Module["printErr"])err=Module["printErr"];if(Module["wasmBinary"])wasmBinary=Module["wasmBinary"];checkIncomingModuleAPI();if(Module["arguments"])arguments_=Module["arguments"];if(Module["thisProgram"])thisProgram=Module["thisProgram"];assert(typeof Module["memoryInitializerPrefixURL"]=="undefined","Module.memoryInitializerPrefixURL option was removed, use Module.locateFile instead");assert(typeof Module["pthreadMainPrefixURL"]=="undefined","Module.pthreadMainPrefixURL option was removed, use Module.locateFile instead");assert(typeof Module["cdInitializerPrefixURL"]=="undefined","Module.cdInitializerPrefixURL option was removed, use Module.locateFile instead");assert(typeof Module["filePackagePrefixURL"]=="undefined","Module.filePackagePrefixURL option was removed, use Module.locateFile instead");assert(typeof Module["read"]=="undefined","Module.read option was removed");assert(typeof Module["readAsync"]=="undefined","Module.readAsync option was removed (modify readAsync in JS)");assert(typeof Module["readBinary"]=="undefined","Module.readBinary option was removed (modify readBinary in JS)");assert(typeof Module["setWindowTitle"]=="undefined","Module.setWindowTitle option was removed (modify emscripten_set_window_title in JS)");assert(typeof Module["TOTAL_MEMORY"]=="undefined","Module.TOTAL_MEMORY has been renamed Module.INITIAL_MEMORY");assert(typeof Module["ENVIRONMENT"]=="undefined","Module.ENVIRONMENT has been deprecated. To force the environment, use the ENVIRONMENT compile-time option (for example, -sENVIRONMENT=web or -sENVIRONMENT=node)");assert(typeof Module["STACK_SIZE"]=="undefined","STACK_SIZE can no longer be set at runtime.  Use -sSTACK_SIZE at link time");if(Module["preInit"]){if(typeof Module["preInit"]=="function")Module["preInit"]=[Module["preInit"]];while(Module["preInit"].length>0){Module["preInit"].shift()()}}consumedModuleProp("preInit")}Module["addRunDependency"]=addRunDependency;Module["removeRunDependency"]=removeRunDependency;Module["ccall"]=ccall;Module["cwrap"]=cwrap;Module["FS_preloadFile"]=FS_preloadFile;Module["FS_unlink"]=FS_unlink;Module["FS_createPath"]=FS_createPath;Module["FS_createDevice"]=FS_createDevice;Module["FS_createDataFile"]=FS_createDataFile;Module["FS_createLazyFile"]=FS_createLazyFile;Module["ExitStatus"]=ExitStatus;Module["HEAP16"]=HEAP16;Module["HEAP32"]=HEAP32;Module["HEAP64"]=HEAP64;Module["HEAP8"]=HEAP8;Module["HEAPF32"]=HEAPF32;Module["HEAPF64"]=HEAPF64;Module["HEAPU16"]=HEAPU16;Module["HEAPU32"]=HEAPU32;Module["HEAPU64"]=HEAPU64;Module["HEAPU8"]=HEAPU8;Module["addOnPostRun"]=addOnPostRun;Module["onPostRuns"]=onPostRuns;Module["callRuntimeCallbacks"]=callRuntimeCallbacks;Module["addOnPreRun"]=addOnPreRun;Module["onPreRuns"]=onPreRuns;Module["addRunDependency"]=addRunDependency;Module["runDependencies"]=runDependencies;Module["removeRunDependency"]=removeRunDependency;Module["dependenciesFulfilled"]=dependenciesFulfilled;Module["runDependencyTracking"]=runDependencyTracking;Module["runDependencyWatcher"]=runDependencyWatcher;Module["dynCall"]=dynCall;Module["dynCallLegacy"]=dynCallLegacy;Module["dynCalls"]=dynCalls;Module["getValue"]=getValue;Module["noExitRuntime"]=noExitRuntime;Module["ptrToString"]=ptrToString;Module["setValue"]=setValue;Module["stackRestore"]=stackRestore;Module["stackSave"]=stackSave;Module["warnOnce"]=warnOnce;Module["wasmMemory"]=wasmMemory;Module["___assert_fail"]=___assert_fail;Module["UTF8ToString"]=UTF8ToString;Module["UTF8ArrayToString"]=UTF8ArrayToString;Module["UTF8Decoder"]=UTF8Decoder;Module["findStringEnd"]=findStringEnd;Module["___cxa_throw"]=___cxa_throw;Module["ExceptionInfo"]=ExceptionInfo;Module["uncaughtExceptionCount"]=uncaughtExceptionCount;Module["___syscall_fcntl64"]=___syscall_fcntl64;Module["syscallGetVarargP"]=syscallGetVarargP;Module["syscallGetVarargI"]=syscallGetVarargI;Module["SYSCALLS"]=SYSCALLS;Module["PATH"]=PATH;Module["FS"]=FS;Module["randomFill"]=randomFill;Module["initRandomFill"]=initRandomFill;Module["PATH_FS"]=PATH_FS;Module["TTY"]=TTY;Module["FS_stdin_getChar"]=FS_stdin_getChar;Module["FS_stdin_getChar_buffer"]=FS_stdin_getChar_buffer;Module["intArrayFromString"]=intArrayFromString;Module["lengthBytesUTF8"]=lengthBytesUTF8;Module["stringToUTF8Array"]=stringToUTF8Array;Module["MEMFS"]=MEMFS;Module["mmapAlloc"]=mmapAlloc;Module["zeroMemory"]=zeroMemory;Module["alignMemory"]=alignMemory;Module["FS_modeStringToFlags"]=FS_modeStringToFlags;Module["FS_fileDataToTypedArray"]=FS_fileDataToTypedArray;Module["FS_getMode"]=FS_getMode;Module["strError"]=strError;Module["ERRNO_CODES"]=ERRNO_CODES;Module["FS_createPreloadedFile"]=FS_createPreloadedFile;Module["FS_preloadFile"]=FS_preloadFile;Module["asyncLoad"]=asyncLoad;Module["FS_createDataFile"]=FS_createDataFile;Module["getUniqueRunDependency"]=getUniqueRunDependency;Module["FS_handledByPreloadPlugin"]=FS_handledByPreloadPlugin;Module["preloadPlugins"]=preloadPlugins;Module["___syscall_ioctl"]=___syscall_ioctl;Module["___syscall_openat"]=___syscall_openat;Module["__abort_js"]=__abort_js;Module["__emscripten_runtime_keepalive_clear"]=__emscripten_runtime_keepalive_clear;Module["runtimeKeepaliveCounter"]=runtimeKeepaliveCounter;Module["__mmap_js"]=__mmap_js;Module["bigintToI53Checked"]=bigintToI53Checked;Module["INT53_MAX"]=INT53_MAX;Module["INT53_MIN"]=INT53_MIN;Module["__munmap_js"]=__munmap_js;Module["__setitimer_js"]=__setitimer_js;Module["timers"]=timers;Module["callUserCallback"]=callUserCallback;Module["handleException"]=handleException;Module["maybeExit"]=maybeExit;Module["_exit"]=_exit;Module["exitJS"]=exitJS;Module["_proc_exit"]=_proc_exit;Module["keepRuntimeAlive"]=keepRuntimeAlive;Module["_emscripten_get_now"]=_emscripten_get_now;Module["__tzset_js"]=__tzset_js;Module["stringToUTF8"]=stringToUTF8;Module["_clock_time_get"]=_clock_time_get;Module["_emscripten_date_now"]=_emscripten_date_now;Module["nowIsMonotonic"]=nowIsMonotonic;Module["checkWasiClock"]=checkWasiClock;Module["_emscripten_err"]=_emscripten_err;Module["_emscripten_get_heap_max"]=_emscripten_get_heap_max;Module["getHeapMax"]=getHeapMax;Module["_emscripten_has_asyncify"]=_emscripten_has_asyncify;Module["_emscripten_resize_heap"]=_emscripten_resize_heap;Module["growMemory"]=growMemory;Module["_emwgpuAdapterRequestDevice"]=_emwgpuAdapterRequestDevice;Module["emwgpuStringToInt_DeviceLostReason"]=emwgpuStringToInt_DeviceLostReason;Module["WebGPU"]=WebGPU;Module["stringToUTF8OnStack"]=stringToUTF8OnStack;Module["stackAlloc"]=stackAlloc;Module["stringToNewUTF8"]=stringToNewUTF8;Module["_emwgpuBufferDestroy"]=_emwgpuBufferDestroy;Module["_emwgpuBufferGetConstMappedRange"]=_emwgpuBufferGetConstMappedRange;Module["_emwgpuBufferGetMappedRange"]=_emwgpuBufferGetMappedRange;Module["_emwgpuBufferMapAsync"]=_emwgpuBufferMapAsync;Module["_emwgpuBufferUnmap"]=_emwgpuBufferUnmap;Module["_emwgpuDelete"]=_emwgpuDelete;Module["_emwgpuDeviceCreateBuffer"]=_emwgpuDeviceCreateBuffer;Module["_emwgpuDeviceCreateShaderModule"]=_emwgpuDeviceCreateShaderModule;Module["_emwgpuDeviceDestroy"]=_emwgpuDeviceDestroy;Module["_emwgpuInstanceRequestAdapter"]=_emwgpuInstanceRequestAdapter;Module["_emwgpuQueueOnSubmittedWorkDone"]=_emwgpuQueueOnSubmittedWorkDone;Module["_emwgpuWaitAny"]=_emwgpuWaitAny;Module["_environ_get"]=_environ_get;Module["getEnvStrings"]=getEnvStrings;Module["ENV"]=ENV;Module["getExecutableName"]=getExecutableName;Module["_environ_sizes_get"]=_environ_sizes_get;Module["_fd_close"]=_fd_close;Module["_fd_read"]=_fd_read;Module["doReadv"]=doReadv;Module["_fd_seek"]=_fd_seek;Module["_fd_write"]=_fd_write;Module["doWritev"]=doWritev;Module["_random_get"]=_random_get;Module["_wgpuAdapterGetFeatures"]=_wgpuAdapterGetFeatures;Module["emwgpuStringToInt_FeatureName"]=emwgpuStringToInt_FeatureName;Module["_wgpuAdapterGetInfo"]=_wgpuAdapterGetInfo;Module["_wgpuAdapterGetLimits"]=_wgpuAdapterGetLimits;Module["_wgpuAdapterHasFeature"]=_wgpuAdapterHasFeature;Module["_wgpuBufferGetSize"]=_wgpuBufferGetSize;Module["_wgpuCommandEncoderBeginComputePass"]=_wgpuCommandEncoderBeginComputePass;Module["_wgpuCommandEncoderCopyBufferToBuffer"]=_wgpuCommandEncoderCopyBufferToBuffer;Module["_wgpuCommandEncoderFinish"]=_wgpuCommandEncoderFinish;Module["_wgpuComputePassEncoderDispatchWorkgroups"]=_wgpuComputePassEncoderDispatchWorkgroups;Module["_wgpuComputePassEncoderEnd"]=_wgpuComputePassEncoderEnd;Module["_wgpuComputePassEncoderSetBindGroup"]=_wgpuComputePassEncoderSetBindGroup;Module["_wgpuComputePassEncoderSetPipeline"]=_wgpuComputePassEncoderSetPipeline;Module["_wgpuComputePipelineGetBindGroupLayout"]=_wgpuComputePipelineGetBindGroupLayout;Module["_wgpuDeviceCreateBindGroup"]=_wgpuDeviceCreateBindGroup;Module["readI53FromI64"]=readI53FromI64;Module["_wgpuDeviceCreateCommandEncoder"]=_wgpuDeviceCreateCommandEncoder;Module["_wgpuDeviceCreateComputePipeline"]=_wgpuDeviceCreateComputePipeline;Module["_wgpuQueueSubmit"]=_wgpuQueueSubmit;Module["_wgpuQueueWriteBuffer"]=_wgpuQueueWriteBuffer;Module["Asyncify"]=Asyncify;Module["runAndAbortIfError"]=runAndAbortIfError;Module["createNamedFunction"]=createNamedFunction;Module["runtimeKeepalivePush"]=runtimeKeepalivePush;Module["runtimeKeepalivePop"]=runtimeKeepalivePop;Module["ccall"]=ccall;Module["getCFunc"]=getCFunc;Module["writeArrayToMemory"]=writeArrayToMemory;Module["cwrap"]=cwrap;Module["FS_createPath"]=FS_createPath;Module["FS_unlink"]=FS_unlink;Module["FS_createLazyFile"]=FS_createLazyFile;Module["FS_createDevice"]=FS_createDevice;function checkIncomingModuleAPI(){ignoredModuleProp("fetchSettings");ignoredModuleProp("logReadFiles");ignoredModuleProp("loadSplitModule");ignoredModuleProp("onMalloc");ignoredModuleProp("onRealloc");ignoredModuleProp("onFree");ignoredModuleProp("onSbrkGrow")}var _wllama_malloc=Module["_wllama_malloc"]=makeInvalidEarlyAccess("_wllama_malloc");var _wllama_start=Module["_wllama_start"]=makeInvalidEarlyAccess("_wllama_start");var _wllama_action=Module["_wllama_action"]=makeInvalidEarlyAccess("_wllama_action");var _wllama_exit=Module["_wllama_exit"]=makeInvalidEarlyAccess("_wllama_exit");var _wllama_debug=Module["_wllama_debug"]=makeInvalidEarlyAccess("_wllama_debug");var _main=Module["_main"]=makeInvalidEarlyAccess("_main");var _fflush=Module["_fflush"]=makeInvalidEarlyAccess("_fflush");var _malloc=Module["_malloc"]=makeInvalidEarlyAccess("_malloc");var _free=Module["_free"]=makeInvalidEarlyAccess("_free");var _strerror=Module["_strerror"]=makeInvalidEarlyAccess("_strerror");var _emwgpuCreateBindGroup=Module["_emwgpuCreateBindGroup"]=makeInvalidEarlyAccess("_emwgpuCreateBindGroup");var _emwgpuCreateBindGroupLayout=Module["_emwgpuCreateBindGroupLayout"]=makeInvalidEarlyAccess("_emwgpuCreateBindGroupLayout");var _emwgpuCreateCommandBuffer=Module["_emwgpuCreateCommandBuffer"]=makeInvalidEarlyAccess("_emwgpuCreateCommandBuffer");var _emwgpuCreateCommandEncoder=Module["_emwgpuCreateCommandEncoder"]=makeInvalidEarlyAccess("_emwgpuCreateCommandEncoder");var _emwgpuCreateComputePassEncoder=Module["_emwgpuCreateComputePassEncoder"]=makeInvalidEarlyAccess("_emwgpuCreateComputePassEncoder");var _emwgpuCreateComputePipeline=Module["_emwgpuCreateComputePipeline"]=makeInvalidEarlyAccess("_emwgpuCreateComputePipeline");var _emwgpuCreatePipelineLayout=Module["_emwgpuCreatePipelineLayout"]=makeInvalidEarlyAccess("_emwgpuCreatePipelineLayout");var _emwgpuCreateQuerySet=Module["_emwgpuCreateQuerySet"]=makeInvalidEarlyAccess("_emwgpuCreateQuerySet");var _emwgpuCreateRenderBundle=Module["_emwgpuCreateRenderBundle"]=makeInvalidEarlyAccess("_emwgpuCreateRenderBundle");var _emwgpuCreateRenderBundleEncoder=Module["_emwgpuCreateRenderBundleEncoder"]=makeInvalidEarlyAccess("_emwgpuCreateRenderBundleEncoder");var _emwgpuCreateRenderPassEncoder=Module["_emwgpuCreateRenderPassEncoder"]=makeInvalidEarlyAccess("_emwgpuCreateRenderPassEncoder");var _emwgpuCreateRenderPipeline=Module["_emwgpuCreateRenderPipeline"]=makeInvalidEarlyAccess("_emwgpuCreateRenderPipeline");var _emwgpuCreateSampler=Module["_emwgpuCreateSampler"]=makeInvalidEarlyAccess("_emwgpuCreateSampler");var _emwgpuCreateSurface=Module["_emwgpuCreateSurface"]=makeInvalidEarlyAccess("_emwgpuCreateSurface");var _emwgpuCreateTexture=Module["_emwgpuCreateTexture"]=makeInvalidEarlyAccess("_emwgpuCreateTexture");var _emwgpuCreateTextureView=Module["_emwgpuCreateTextureView"]=makeInvalidEarlyAccess("_emwgpuCreateTextureView");var _emwgpuCreateAdapter=Module["_emwgpuCreateAdapter"]=makeInvalidEarlyAccess("_emwgpuCreateAdapter");var _emwgpuCreateBuffer=Module["_emwgpuCreateBuffer"]=makeInvalidEarlyAccess("_emwgpuCreateBuffer");var _emwgpuCreateDevice=Module["_emwgpuCreateDevice"]=makeInvalidEarlyAccess("_emwgpuCreateDevice");var _emwgpuCreateQueue=Module["_emwgpuCreateQueue"]=makeInvalidEarlyAccess("_emwgpuCreateQueue");var _emwgpuCreateShaderModule=Module["_emwgpuCreateShaderModule"]=makeInvalidEarlyAccess("_emwgpuCreateShaderModule");var _emwgpuOnDeviceLostCompleted=Module["_emwgpuOnDeviceLostCompleted"]=makeInvalidEarlyAccess("_emwgpuOnDeviceLostCompleted");var _emwgpuOnMapAsyncCompleted=Module["_emwgpuOnMapAsyncCompleted"]=makeInvalidEarlyAccess("_emwgpuOnMapAsyncCompleted");var _emwgpuOnRequestAdapterCompleted=Module["_emwgpuOnRequestAdapterCompleted"]=makeInvalidEarlyAccess("_emwgpuOnRequestAdapterCompleted");var _emwgpuOnRequestDeviceCompleted=Module["_emwgpuOnRequestDeviceCompleted"]=makeInvalidEarlyAccess("_emwgpuOnRequestDeviceCompleted");var _emwgpuOnWorkDoneCompleted=Module["_emwgpuOnWorkDoneCompleted"]=makeInvalidEarlyAccess("_emwgpuOnWorkDoneCompleted");var _emwgpuOnUncapturedError=Module["_emwgpuOnUncapturedError"]=makeInvalidEarlyAccess("_emwgpuOnUncapturedError");var _emscripten_stack_get_end=Module["_emscripten_stack_get_end"]=makeInvalidEarlyAccess("_emscripten_stack_get_end");var _emscripten_stack_get_base=Module["_emscripten_stack_get_base"]=makeInvalidEarlyAccess("_emscripten_stack_get_base");var _emscripten_builtin_memalign=Module["_emscripten_builtin_memalign"]=makeInvalidEarlyAccess("_emscripten_builtin_memalign");var __emscripten_timeout=Module["__emscripten_timeout"]=makeInvalidEarlyAccess("__emscripten_timeout");var _memalign=Module["_memalign"]=makeInvalidEarlyAccess("_memalign");var _emscripten_stack_init=Module["_emscripten_stack_init"]=makeInvalidEarlyAccess("_emscripten_stack_init");var _emscripten_stack_get_free=Module["_emscripten_stack_get_free"]=makeInvalidEarlyAccess("_emscripten_stack_get_free");var __emscripten_stack_restore=Module["__emscripten_stack_restore"]=makeInvalidEarlyAccess("__emscripten_stack_restore");var __emscripten_stack_alloc=Module["__emscripten_stack_alloc"]=makeInvalidEarlyAccess("__emscripten_stack_alloc");var _emscripten_stack_get_current=Module["_emscripten_stack_get_current"]=makeInvalidEarlyAccess("_emscripten_stack_get_current");var dynCall_ii=Module["dynCall_ii"]=makeInvalidEarlyAccess("dynCall_ii");var dynCall_ifi=Module["dynCall_ifi"]=makeInvalidEarlyAccess("dynCall_ifi");var dynCall_viii=Module["dynCall_viii"]=makeInvalidEarlyAccess("dynCall_viii");var dynCall_iiii=Module["dynCall_iiii"]=makeInvalidEarlyAccess("dynCall_iiii");var dynCall_vi=Module["dynCall_vi"]=makeInvalidEarlyAccess("dynCall_vi");var dynCall_viiii=Module["dynCall_viiii"]=makeInvalidEarlyAccess("dynCall_viiii");var dynCall_iii=Module["dynCall_iii"]=makeInvalidEarlyAccess("dynCall_iii");var dynCall_viiiii=Module["dynCall_viiiii"]=makeInvalidEarlyAccess("dynCall_viiiii");var dynCall_vii=Module["dynCall_vii"]=makeInvalidEarlyAccess("dynCall_vii");var dynCall_i=Module["dynCall_i"]=makeInvalidEarlyAccess("dynCall_i");var dynCall_jiji=Module["dynCall_jiji"]=makeInvalidEarlyAccess("dynCall_jiji");var dynCall_iidiiii=Module["dynCall_iidiiii"]=makeInvalidEarlyAccess("dynCall_iidiiii");var dynCall_iiiii=Module["dynCall_iiiii"]=makeInvalidEarlyAccess("dynCall_iiiii");var dynCall_iiiiiiiii=Module["dynCall_iiiiiiiii"]=makeInvalidEarlyAccess("dynCall_iiiiiiiii");var dynCall_iiiiii=Module["dynCall_iiiiii"]=makeInvalidEarlyAccess("dynCall_iiiiii");var dynCall_viij=Module["dynCall_viij"]=makeInvalidEarlyAccess("dynCall_viij");var dynCall_viiiiiiii=Module["dynCall_viiiiiiii"]=makeInvalidEarlyAccess("dynCall_viiiiiiii");var dynCall_v=Module["dynCall_v"]=makeInvalidEarlyAccess("dynCall_v");var dynCall_viji=Module["dynCall_viji"]=makeInvalidEarlyAccess("dynCall_viji");var dynCall_viijii=Module["dynCall_viijii"]=makeInvalidEarlyAccess("dynCall_viijii");var dynCall_iiiiiii=Module["dynCall_iiiiiii"]=makeInvalidEarlyAccess("dynCall_iiiiiii");var dynCall_iiiiij=Module["dynCall_iiiiij"]=makeInvalidEarlyAccess("dynCall_iiiiij");var dynCall_iiiiid=Module["dynCall_iiiiid"]=makeInvalidEarlyAccess("dynCall_iiiiid");var dynCall_iiiiijj=Module["dynCall_iiiiijj"]=makeInvalidEarlyAccess("dynCall_iiiiijj");var dynCall_iiiiiiii=Module["dynCall_iiiiiiii"]=makeInvalidEarlyAccess("dynCall_iiiiiiii");var dynCall_iiiiiijj=Module["dynCall_iiiiiijj"]=makeInvalidEarlyAccess("dynCall_iiiiiijj");var dynCall_viiiiii=Module["dynCall_viiiiii"]=makeInvalidEarlyAccess("dynCall_viiiiii");var _asyncify_start_unwind=Module["_asyncify_start_unwind"]=makeInvalidEarlyAccess("_asyncify_start_unwind");var _asyncify_stop_unwind=Module["_asyncify_stop_unwind"]=makeInvalidEarlyAccess("_asyncify_stop_unwind");var _asyncify_start_rewind=Module["_asyncify_start_rewind"]=makeInvalidEarlyAccess("_asyncify_start_rewind");var _asyncify_stop_rewind=Module["_asyncify_stop_rewind"]=makeInvalidEarlyAccess("_asyncify_stop_rewind");var __indirect_function_table=Module["__indirect_function_table"]=makeInvalidEarlyAccess("__indirect_function_table");function assignWasmExports(wasmExports){assert(typeof wasmExports["wllama_malloc"]!="undefined","missing Wasm export: wllama_malloc");assert(typeof wasmExports["wllama_start"]!="undefined","missing Wasm export: wllama_start");assert(typeof wasmExports["wllama_action"]!="undefined","missing Wasm export: wllama_action");assert(typeof wasmExports["wllama_exit"]!="undefined","missing Wasm export: wllama_exit");assert(typeof wasmExports["wllama_debug"]!="undefined","missing Wasm export: wllama_debug");assert(typeof wasmExports["main"]!="undefined","missing Wasm export: main");assert(typeof wasmExports["fflush"]!="undefined","missing Wasm export: fflush");assert(typeof wasmExports["malloc"]!="undefined","missing Wasm export: malloc");assert(typeof wasmExports["free"]!="undefined","missing Wasm export: free");assert(typeof wasmExports["strerror"]!="undefined","missing Wasm export: strerror");assert(typeof wasmExports["emwgpuCreateBindGroup"]!="undefined","missing Wasm export: emwgpuCreateBindGroup");assert(typeof wasmExports["emwgpuCreateBindGroupLayout"]!="undefined","missing Wasm export: emwgpuCreateBindGroupLayout");assert(typeof wasmExports["emwgpuCreateCommandBuffer"]!="undefined","missing Wasm export: emwgpuCreateCommandBuffer");assert(typeof wasmExports["emwgpuCreateCommandEncoder"]!="undefined","missing Wasm export: emwgpuCreateCommandEncoder");assert(typeof wasmExports["emwgpuCreateComputePassEncoder"]!="undefined","missing Wasm export: emwgpuCreateComputePassEncoder");assert(typeof wasmExports["emwgpuCreateComputePipeline"]!="undefined","missing Wasm export: emwgpuCreateComputePipeline");assert(typeof wasmExports["emwgpuCreatePipelineLayout"]!="undefined","missing Wasm export: emwgpuCreatePipelineLayout");assert(typeof wasmExports["emwgpuCreateQuerySet"]!="undefined","missing Wasm export: emwgpuCreateQuerySet");assert(typeof wasmExports["emwgpuCreateRenderBundle"]!="undefined","missing Wasm export: emwgpuCreateRenderBundle");assert(typeof wasmExports["emwgpuCreateRenderBundleEncoder"]!="undefined","missing Wasm export: emwgpuCreateRenderBundleEncoder");assert(typeof wasmExports["emwgpuCreateRenderPassEncoder"]!="undefined","missing Wasm export: emwgpuCreateRenderPassEncoder");assert(typeof wasmExports["emwgpuCreateRenderPipeline"]!="undefined","missing Wasm export: emwgpuCreateRenderPipeline");assert(typeof wasmExports["emwgpuCreateSampler"]!="undefined","missing Wasm export: emwgpuCreateSampler");assert(typeof wasmExports["emwgpuCreateSurface"]!="undefined","missing Wasm export: emwgpuCreateSurface");assert(typeof wasmExports["emwgpuCreateTexture"]!="undefined","missing Wasm export: emwgpuCreateTexture");assert(typeof wasmExports["emwgpuCreateTextureView"]!="undefined","missing Wasm export: emwgpuCreateTextureView");assert(typeof wasmExports["emwgpuCreateAdapter"]!="undefined","missing Wasm export: emwgpuCreateAdapter");assert(typeof wasmExports["emwgpuCreateBuffer"]!="undefined","missing Wasm export: emwgpuCreateBuffer");assert(typeof wasmExports["emwgpuCreateDevice"]!="undefined","missing Wasm export: emwgpuCreateDevice");assert(typeof wasmExports["emwgpuCreateQueue"]!="undefined","missing Wasm export: emwgpuCreateQueue");assert(typeof wasmExports["emwgpuCreateShaderModule"]!="undefined","missing Wasm export: emwgpuCreateShaderModule");assert(typeof wasmExports["emwgpuOnDeviceLostCompleted"]!="undefined","missing Wasm export: emwgpuOnDeviceLostCompleted");assert(typeof wasmExports["emwgpuOnMapAsyncCompleted"]!="undefined","missing Wasm export: emwgpuOnMapAsyncCompleted");assert(typeof wasmExports["emwgpuOnRequestAdapterCompleted"]!="undefined","missing Wasm export: emwgpuOnRequestAdapterCompleted");assert(typeof wasmExports["emwgpuOnRequestDeviceCompleted"]!="undefined","missing Wasm export: emwgpuOnRequestDeviceCompleted");assert(typeof wasmExports["emwgpuOnWorkDoneCompleted"]!="undefined","missing Wasm export: emwgpuOnWorkDoneCompleted");assert(typeof wasmExports["emwgpuOnUncapturedError"]!="undefined","missing Wasm export: emwgpuOnUncapturedError");assert(typeof wasmExports["emscripten_stack_get_end"]!="undefined","missing Wasm export: emscripten_stack_get_end");assert(typeof wasmExports["emscripten_stack_get_base"]!="undefined","missing Wasm export: emscripten_stack_get_base");assert(typeof wasmExports["emscripten_builtin_memalign"]!="undefined","missing Wasm export: emscripten_builtin_memalign");assert(typeof wasmExports["_emscripten_timeout"]!="undefined","missing Wasm export: _emscripten_timeout");assert(typeof wasmExports["memalign"]!="undefined","missing Wasm export: memalign");assert(typeof wasmExports["emscripten_stack_init"]!="undefined","missing Wasm export: emscripten_stack_init");assert(typeof wasmExports["emscripten_stack_get_free"]!="undefined","missing Wasm export: emscripten_stack_get_free");assert(typeof wasmExports["_emscripten_stack_restore"]!="undefined","missing Wasm export: _emscripten_stack_restore");assert(typeof wasmExports["_emscripten_stack_alloc"]!="undefined","missing Wasm export: _emscripten_stack_alloc");assert(typeof wasmExports["emscripten_stack_get_current"]!="undefined","missing Wasm export: emscripten_stack_get_current");assert(typeof wasmExports["dynCall_ii"]!="undefined","missing Wasm export: dynCall_ii");assert(typeof wasmExports["dynCall_ifi"]!="undefined","missing Wasm export: dynCall_ifi");assert(typeof wasmExports["dynCall_viii"]!="undefined","missing Wasm export: dynCall_viii");assert(typeof wasmExports["dynCall_iiii"]!="undefined","missing Wasm export: dynCall_iiii");assert(typeof wasmExports["dynCall_vi"]!="undefined","missing Wasm export: dynCall_vi");assert(typeof wasmExports["dynCall_viiii"]!="undefined","missing Wasm export: dynCall_viiii");assert(typeof wasmExports["dynCall_iii"]!="undefined","missing Wasm export: dynCall_iii");assert(typeof wasmExports["dynCall_viiiii"]!="undefined","missing Wasm export: dynCall_viiiii");assert(typeof wasmExports["dynCall_vii"]!="undefined","missing Wasm export: dynCall_vii");assert(typeof wasmExports["dynCall_i"]!="undefined","missing Wasm export: dynCall_i");assert(typeof wasmExports["dynCall_jiji"]!="undefined","missing Wasm export: dynCall_jiji");assert(typeof wasmExports["dynCall_iidiiii"]!="undefined","missing Wasm export: dynCall_iidiiii");assert(typeof wasmExports["dynCall_iiiii"]!="undefined","missing Wasm export: dynCall_iiiii");assert(typeof wasmExports["dynCall_iiiiiiiii"]!="undefined","missing Wasm export: dynCall_iiiiiiiii");assert(typeof wasmExports["dynCall_iiiiii"]!="undefined","missing Wasm export: dynCall_iiiiii");assert(typeof wasmExports["dynCall_viij"]!="undefined","missing Wasm export: dynCall_viij");assert(typeof wasmExports["dynCall_viiiiiiii"]!="undefined","missing Wasm export: dynCall_viiiiiiii");assert(typeof wasmExports["dynCall_v"]!="undefined","missing Wasm export: dynCall_v");assert(typeof wasmExports["dynCall_viji"]!="undefined","missing Wasm export: dynCall_viji");assert(typeof wasmExports["dynCall_viijii"]!="undefined","missing Wasm export: dynCall_viijii");assert(typeof wasmExports["dynCall_iiiiiii"]!="undefined","missing Wasm export: dynCall_iiiiiii");assert(typeof wasmExports["dynCall_iiiiij"]!="undefined","missing Wasm export: dynCall_iiiiij");assert(typeof wasmExports["dynCall_iiiiid"]!="undefined","missing Wasm export: dynCall_iiiiid");assert(typeof wasmExports["dynCall_iiiiijj"]!="undefined","missing Wasm export: dynCall_iiiiijj");assert(typeof wasmExports["dynCall_iiiiiiii"]!="undefined","missing Wasm export: dynCall_iiiiiiii");assert(typeof wasmExports["dynCall_iiiiiijj"]!="undefined","missing Wasm export: dynCall_iiiiiijj");assert(typeof wasmExports["dynCall_viiiiii"]!="undefined","missing Wasm export: dynCall_viiiiii");assert(typeof wasmExports["asyncify_start_unwind"]!="undefined","missing Wasm export: asyncify_start_unwind");assert(typeof wasmExports["asyncify_stop_unwind"]!="undefined","missing Wasm export: asyncify_stop_unwind");assert(typeof wasmExports["asyncify_start_rewind"]!="undefined","missing Wasm export: asyncify_start_rewind");assert(typeof wasmExports["asyncify_stop_rewind"]!="undefined","missing Wasm export: asyncify_stop_rewind");assert(typeof wasmExports["__indirect_function_table"]!="undefined","missing Wasm export: __indirect_function_table");_wllama_malloc=Module["_wllama_malloc"]=createExportWrapper("wllama_malloc",2);_wllama_start=Module["_wllama_start"]=createExportWrapper("wllama_start",0);_wllama_action=Module["_wllama_action"]=createExportWrapper("wllama_action",2);_wllama_exit=Module["_wllama_exit"]=createExportWrapper("wllama_exit",0);_wllama_debug=Module["_wllama_debug"]=createExportWrapper("wllama_debug",0);_main=Module["_main"]=createExportWrapper("main",2);_fflush=Module["_fflush"]=createExportWrapper("fflush",1);_malloc=Module["_malloc"]=createExportWrapper("malloc",1);_free=Module["_free"]=createExportWrapper("free",1);_strerror=Module["_strerror"]=createExportWrapper("strerror",1);_emwgpuCreateBindGroup=Module["_emwgpuCreateBindGroup"]=createExportWrapper("emwgpuCreateBindGroup",1);_emwgpuCreateBindGroupLayout=Module["_emwgpuCreateBindGroupLayout"]=createExportWrapper("emwgpuCreateBindGroupLayout",1);_emwgpuCreateCommandBuffer=Module["_emwgpuCreateCommandBuffer"]=createExportWrapper("emwgpuCreateCommandBuffer",1);_emwgpuCreateCommandEncoder=Module["_emwgpuCreateCommandEncoder"]=createExportWrapper("emwgpuCreateCommandEncoder",1);_emwgpuCreateComputePassEncoder=Module["_emwgpuCreateComputePassEncoder"]=createExportWrapper("emwgpuCreateComputePassEncoder",1);_emwgpuCreateComputePipeline=Module["_emwgpuCreateComputePipeline"]=createExportWrapper("emwgpuCreateComputePipeline",1);_emwgpuCreatePipelineLayout=Module["_emwgpuCreatePipelineLayout"]=createExportWrapper("emwgpuCreatePipelineLayout",1);_emwgpuCreateQuerySet=Module["_emwgpuCreateQuerySet"]=createExportWrapper("emwgpuCreateQuerySet",1);_emwgpuCreateRenderBundle=Module["_emwgpuCreateRenderBundle"]=createExportWrapper("emwgpuCreateRenderBundle",1);_emwgpuCreateRenderBundleEncoder=Module["_emwgpuCreateRenderBundleEncoder"]=createExportWrapper("emwgpuCreateRenderBundleEncoder",1);_emwgpuCreateRenderPassEncoder=Module["_emwgpuCreateRenderPassEncoder"]=createExportWrapper("emwgpuCreateRenderPassEncoder",1);_emwgpuCreateRenderPipeline=Module["_emwgpuCreateRenderPipeline"]=createExportWrapper("emwgpuCreateRenderPipeline",1);_emwgpuCreateSampler=Module["_emwgpuCreateSampler"]=createExportWrapper("emwgpuCreateSampler",1);_emwgpuCreateSurface=Module["_emwgpuCreateSurface"]=createExportWrapper("emwgpuCreateSurface",1);_emwgpuCreateTexture=Module["_emwgpuCreateTexture"]=createExportWrapper("emwgpuCreateTexture",1);_emwgpuCreateTextureView=Module["_emwgpuCreateTextureView"]=createExportWrapper("emwgpuCreateTextureView",1);_emwgpuCreateAdapter=Module["_emwgpuCreateAdapter"]=createExportWrapper("emwgpuCreateAdapter",1);_emwgpuCreateBuffer=Module["_emwgpuCreateBuffer"]=createExportWrapper("emwgpuCreateBuffer",2);_emwgpuCreateDevice=Module["_emwgpuCreateDevice"]=createExportWrapper("emwgpuCreateDevice",2);_emwgpuCreateQueue=Module["_emwgpuCreateQueue"]=createExportWrapper("emwgpuCreateQueue",1);_emwgpuCreateShaderModule=Module["_emwgpuCreateShaderModule"]=createExportWrapper("emwgpuCreateShaderModule",1);_emwgpuOnDeviceLostCompleted=Module["_emwgpuOnDeviceLostCompleted"]=createExportWrapper("emwgpuOnDeviceLostCompleted",3);_emwgpuOnMapAsyncCompleted=Module["_emwgpuOnMapAsyncCompleted"]=createExportWrapper("emwgpuOnMapAsyncCompleted",3);_emwgpuOnRequestAdapterCompleted=Module["_emwgpuOnRequestAdapterCompleted"]=createExportWrapper("emwgpuOnRequestAdapterCompleted",4);_emwgpuOnRequestDeviceCompleted=Module["_emwgpuOnRequestDeviceCompleted"]=createExportWrapper("emwgpuOnRequestDeviceCompleted",4);_emwgpuOnWorkDoneCompleted=Module["_emwgpuOnWorkDoneCompleted"]=createExportWrapper("emwgpuOnWorkDoneCompleted",2);_emwgpuOnUncapturedError=Module["_emwgpuOnUncapturedError"]=createExportWrapper("emwgpuOnUncapturedError",3);_emscripten_stack_get_end=Module["_emscripten_stack_get_end"]=wasmExports["emscripten_stack_get_end"];_emscripten_stack_get_base=Module["_emscripten_stack_get_base"]=wasmExports["emscripten_stack_get_base"];_emscripten_builtin_memalign=Module["_emscripten_builtin_memalign"]=createExportWrapper("emscripten_builtin_memalign",2);__emscripten_timeout=Module["__emscripten_timeout"]=createExportWrapper("_emscripten_timeout",2);_memalign=Module["_memalign"]=createExportWrapper("memalign",2);_emscripten_stack_init=Module["_emscripten_stack_init"]=wasmExports["emscripten_stack_init"];_emscripten_stack_get_free=Module["_emscripten_stack_get_free"]=wasmExports["emscripten_stack_get_free"];__emscripten_stack_restore=Module["__emscripten_stack_restore"]=wasmExports["_emscripten_stack_restore"];__emscripten_stack_alloc=Module["__emscripten_stack_alloc"]=wasmExports["_emscripten_stack_alloc"];_emscripten_stack_get_current=Module["_emscripten_stack_get_current"]=wasmExports["emscripten_stack_get_current"];dynCall_ii=dynCalls["ii"]=Module["dynCall_ii"]=createExportWrapper("dynCall_ii",2);dynCall_ifi=dynCalls["ifi"]=Module["dynCall_ifi"]=createExportWrapper("dynCall_ifi",3);dynCall_viii=dynCalls["viii"]=Module["dynCall_viii"]=createExportWrapper("dynCall_viii",4);dynCall_iiii=dynCalls["iiii"]=Module["dynCall_iiii"]=createExportWrapper("dynCall_iiii",4);dynCall_vi=dynCalls["vi"]=Module["dynCall_vi"]=createExportWrapper("dynCall_vi",2);dynCall_viiii=dynCalls["viiii"]=Module["dynCall_viiii"]=createExportWrapper("dynCall_viiii",5);dynCall_iii=dynCalls["iii"]=Module["dynCall_iii"]=createExportWrapper("dynCall_iii",3);dynCall_viiiii=dynCalls["viiiii"]=Module["dynCall_viiiii"]=createExportWrapper("dynCall_viiiii",6);dynCall_vii=dynCalls["vii"]=Module["dynCall_vii"]=createExportWrapper("dynCall_vii",3);dynCall_i=dynCalls["i"]=Module["dynCall_i"]=createExportWrapper("dynCall_i",1);dynCall_jiji=dynCalls["jiji"]=Module["dynCall_jiji"]=createExportWrapper("dynCall_jiji",4);dynCall_iidiiii=dynCalls["iidiiii"]=Module["dynCall_iidiiii"]=createExportWrapper("dynCall_iidiiii",7);dynCall_iiiii=dynCalls["iiiii"]=Module["dynCall_iiiii"]=createExportWrapper("dynCall_iiiii",5);dynCall_iiiiiiiii=dynCalls["iiiiiiiii"]=Module["dynCall_iiiiiiiii"]=createExportWrapper("dynCall_iiiiiiiii",9);dynCall_iiiiii=dynCalls["iiiiii"]=Module["dynCall_iiiiii"]=createExportWrapper("dynCall_iiiiii",6);dynCall_viij=dynCalls["viij"]=Module["dynCall_viij"]=createExportWrapper("dynCall_viij",4);dynCall_viiiiiiii=dynCalls["viiiiiiii"]=Module["dynCall_viiiiiiii"]=createExportWrapper("dynCall_viiiiiiii",9);dynCall_v=dynCalls["v"]=Module["dynCall_v"]=createExportWrapper("dynCall_v",1);dynCall_viji=dynCalls["viji"]=Module["dynCall_viji"]=createExportWrapper("dynCall_viji",4);dynCall_viijii=dynCalls["viijii"]=Module["dynCall_viijii"]=createExportWrapper("dynCall_viijii",6);dynCall_iiiiiii=dynCalls["iiiiiii"]=Module["dynCall_iiiiiii"]=createExportWrapper("dynCall_iiiiiii",7);dynCall_iiiiij=dynCalls["iiiiij"]=Module["dynCall_iiiiij"]=createExportWrapper("dynCall_iiiiij",6);dynCall_iiiiid=dynCalls["iiiiid"]=Module["dynCall_iiiiid"]=createExportWrapper("dynCall_iiiiid",6);dynCall_iiiiijj=dynCalls["iiiiijj"]=Module["dynCall_iiiiijj"]=createExportWrapper("dynCall_iiiiijj",7);dynCall_iiiiiiii=dynCalls["iiiiiiii"]=Module["dynCall_iiiiiiii"]=createExportWrapper("dynCall_iiiiiiii",8);dynCall_iiiiiijj=dynCalls["iiiiiijj"]=Module["dynCall_iiiiiijj"]=createExportWrapper("dynCall_iiiiiijj",8);dynCall_viiiiii=dynCalls["viiiiii"]=Module["dynCall_viiiiii"]=createExportWrapper("dynCall_viiiiii",7);_asyncify_start_unwind=Module["_asyncify_start_unwind"]=createExportWrapper("asyncify_start_unwind",1);_asyncify_stop_unwind=Module["_asyncify_stop_unwind"]=createExportWrapper("asyncify_stop_unwind",0);_asyncify_start_rewind=Module["_asyncify_start_rewind"]=createExportWrapper("asyncify_start_rewind",1);_asyncify_stop_rewind=Module["_asyncify_stop_rewind"]=createExportWrapper("asyncify_stop_rewind",0);__indirect_function_table=Module["__indirect_function_table"]=wasmExports["__indirect_function_table"]}var wasmImports={__assert_fail:___assert_fail,__cxa_throw:___cxa_throw,__syscall_fcntl64:___syscall_fcntl64,__syscall_ioctl:___syscall_ioctl,__syscall_openat:___syscall_openat,_abort_js:__abort_js,_emscripten_runtime_keepalive_clear:__emscripten_runtime_keepalive_clear,_mmap_js:__mmap_js,_munmap_js:__munmap_js,_setitimer_js:__setitimer_js,_tzset_js:__tzset_js,clock_time_get:_clock_time_get,emscripten_date_now:_emscripten_date_now,emscripten_err:_emscripten_err,emscripten_get_heap_max:_emscripten_get_heap_max,emscripten_has_asyncify:_emscripten_has_asyncify,emscripten_resize_heap:_emscripten_resize_heap,emwgpuAdapterRequestDevice:_emwgpuAdapterRequestDevice,emwgpuBufferDestroy:_emwgpuBufferDestroy,emwgpuBufferGetConstMappedRange:_emwgpuBufferGetConstMappedRange,emwgpuBufferGetMappedRange:_emwgpuBufferGetMappedRange,emwgpuBufferMapAsync:_emwgpuBufferMapAsync,emwgpuBufferUnmap:_emwgpuBufferUnmap,emwgpuDelete:_emwgpuDelete,emwgpuDeviceCreateBuffer:_emwgpuDeviceCreateBuffer,emwgpuDeviceCreateShaderModule:_emwgpuDeviceCreateShaderModule,emwgpuDeviceDestroy:_emwgpuDeviceDestroy,emwgpuInstanceRequestAdapter:_emwgpuInstanceRequestAdapter,emwgpuQueueOnSubmittedWorkDone:_emwgpuQueueOnSubmittedWorkDone,emwgpuWaitAny:_emwgpuWaitAny,environ_get:_environ_get,environ_sizes_get:_environ_sizes_get,fd_close:_fd_close,fd_read:_fd_read,fd_seek:_fd_seek,fd_write:_fd_write,memory:wasmMemory,proc_exit:_proc_exit,random_get:_random_get,wgpuAdapterGetFeatures:_wgpuAdapterGetFeatures,wgpuAdapterGetInfo:_wgpuAdapterGetInfo,wgpuAdapterGetLimits:_wgpuAdapterGetLimits,wgpuAdapterHasFeature:_wgpuAdapterHasFeature,wgpuBufferGetSize:_wgpuBufferGetSize,wgpuCommandEncoderBeginComputePass:_wgpuCommandEncoderBeginComputePass,wgpuCommandEncoderCopyBufferToBuffer:_wgpuCommandEncoderCopyBufferToBuffer,wgpuCommandEncoderFinish:_wgpuCommandEncoderFinish,wgpuComputePassEncoderDispatchWorkgroups:_wgpuComputePassEncoderDispatchWorkgroups,wgpuComputePassEncoderEnd:_wgpuComputePassEncoderEnd,wgpuComputePassEncoderSetBindGroup:_wgpuComputePassEncoderSetBindGroup,wgpuComputePassEncoderSetPipeline:_wgpuComputePassEncoderSetPipeline,wgpuComputePipelineGetBindGroupLayout:_wgpuComputePipelineGetBindGroupLayout,wgpuDeviceCreateBindGroup:_wgpuDeviceCreateBindGroup,wgpuDeviceCreateCommandEncoder:_wgpuDeviceCreateCommandEncoder,wgpuDeviceCreateComputePipeline:_wgpuDeviceCreateComputePipeline,wgpuQueueSubmit:_wgpuQueueSubmit,wgpuQueueWriteBuffer:_wgpuQueueWriteBuffer};var calledRun;function callMain(){assert(runDependencies==0,\'cannot call main when async dependencies remain! (listen on Module["onRuntimeInitialized"])\');assert(typeof onPreRuns==="undefined"||onPreRuns.length==0,"cannot call main when preRun functions remain to be called");var entryFunction=_main;var argc=0;var argv=0;try{var ret=entryFunction(argc,argv);exitJS(ret,true);return ret}catch(e){return handleException(e)}}function stackCheckInit(){_emscripten_stack_init();writeStackCookie()}function run(){if(runDependencies>0){dependenciesFulfilled=run;return}stackCheckInit();preRun();if(runDependencies>0){dependenciesFulfilled=run;return}function doRun(){assert(!calledRun);calledRun=true;Module["calledRun"]=true;if(ABORT)return;initRuntime();preMain();Module["onRuntimeInitialized"]?.();consumedModuleProp("onRuntimeInitialized");var noInitialRun=Module["noInitialRun"]||false;if(!noInitialRun)callMain();postRun()}if(Module["setStatus"]){Module["setStatus"]("Running...");setTimeout(()=>{setTimeout(()=>Module["setStatus"](""),1);doRun()},1)}else{doRun()}checkStackCookie()}function checkUnflushedContent(){var oldOut=out;var oldErr=err;var has=false;out=err=x=>{has=true};try{_fflush(0);for(var name of["stdout","stderr"]){var info=FS.analyzePath("/dev/"+name);if(!info)return;var stream=info.object;var rdev=stream.rdev;var tty=TTY.ttys[rdev];if(tty?.output?.length){has=true}}}catch(e){}out=oldOut;err=oldErr;if(has){warnOnce("stdio streams had content in them that was not flushed. you should set EXIT_RUNTIME to 1 (see the Emscripten FAQ), or make sure to emit a newline when you printf etc.")}}var wasmExports;createWasm();run();\n';

// src/worker.ts
var ProxyToWorker = class {
  constructor(pathConfig, nbThread = 1, suppressNativeLog, logger) {
    __publicField(this, "logger");
    __publicField(this, "suppressNativeLog");
    __publicField(this, "taskQueue", []);
    __publicField(this, "taskId", 1);
    __publicField(this, "resultQueue", []);
    __publicField(this, "busy", false);
    // is the work loop is running?
    __publicField(this, "worker");
    __publicField(this, "pathConfig");
    __publicField(this, "multiThread");
    __publicField(this, "nbThread");
    this.pathConfig = pathConfig;
    this.nbThread = nbThread;
    this.multiThread = nbThread > 1;
    this.logger = logger;
    this.suppressNativeLog = suppressNativeLog;
  }
  moduleInit(ggufFiles) {
    return __async(this, null, function* () {
      if (!this.pathConfig["wllama.wasm"]) {
        throw new Error('"single-thread/wllama.wasm" is missing from pathConfig');
      }
      let moduleCode = this.multiThread ? WLLAMA_MULTI_THREAD_CODE : WLLAMA_SINGLE_THREAD_CODE;
      let mainModuleCode = moduleCode.replace("var Module", "var ___Module");
      const runOptions = {
        pathConfig: this.pathConfig,
        nbThread: this.nbThread
      };
      const completeCode = [
        `const RUN_OPTIONS = ${JSON.stringify(runOptions)};`,
        `function wModuleInit() { ${mainModuleCode}; return Module; }`,
        LLAMA_CPP_WORKER_CODE
      ].join(";\n\n");
      this.worker = createWorker(completeCode);
      this.worker.onmessage = this.onRecvMsg.bind(this);
      this.worker.onerror = this.logger.error;
      const res = yield this.pushTask({
        verb: "module.init",
        args: [new Blob([moduleCode], { type: "text/javascript" })],
        callbackId: this.taskId++
      });
      const nativeFiles = [];
      for (const file of ggufFiles) {
        const id = yield this.fileAlloc(file.name, file.blob.size);
        nativeFiles.push(__spreadValues({ id }, file));
      }
      yield Promise.all(
        nativeFiles.map((file) => {
          return this.fileWrite(file.id, file.blob);
        })
      );
      return res;
    });
  }
  wllamaStart() {
    return __async(this, null, function* () {
      const result = yield this.pushTask({
        verb: "wllama.start",
        args: [],
        callbackId: this.taskId++
      });
      const parsedResult = this.parseResult(result);
      return parsedResult;
    });
  }
  wllamaAction(name, body) {
    return __async(this, null, function* () {
      const encodedMsg = glueSerialize(body);
      const result = yield this.pushTask({
        verb: "wllama.action",
        args: [name, encodedMsg],
        callbackId: this.taskId++
      });
      const parsedResult = glueDeserialize(result);
      return parsedResult;
    });
  }
  wllamaExit() {
    return __async(this, null, function* () {
      if (this.worker) {
        const result = yield this.pushTask({
          verb: "wllama.exit",
          args: [],
          callbackId: this.taskId++
        });
        this.parseResult(result);
        this.worker.terminate();
      }
    });
  }
  wllamaDebug() {
    return __async(this, null, function* () {
      const result = yield this.pushTask({
        verb: "wllama.debug",
        args: [],
        callbackId: this.taskId++
      });
      return JSON.parse(result);
    });
  }
  ///////////////////////////////////////
  /**
   * Allocate a new file in heapfs
   * @returns fileId, to be used by fileWrite()
   */
  fileAlloc(fileName, size) {
    return __async(this, null, function* () {
      const result = yield this.pushTask({
        verb: "fs.alloc",
        args: [fileName, size],
        callbackId: this.taskId++
      });
      return result.fileId;
    });
  }
  /**
   * Write a Blob to heapfs
   */
  fileWrite(fileId, blob) {
    return __async(this, null, function* () {
      const reader = blob.stream().getReader();
      let offset = 0;
      while (true) {
        const { done, value } = yield reader.read();
        if (done) break;
        const size = value.byteLength;
        yield this.pushTask(
          {
            verb: "fs.write",
            args: [fileId, value, offset],
            callbackId: this.taskId++
          },
          // @ts-ignore Type 'ArrayBufferLike' is not assignable to type 'ArrayBuffer'
          [value.buffer]
        );
        offset += size;
      }
    });
  }
  /**
   * Parse JSON result returned by cpp code.
   * Throw new Error if "__exception" is present in the response
   *
   * TODO: get rid of this function once everything is migrated to Glue
   */
  parseResult(result) {
    const parsedResult = JSON.parse(result);
    if (parsedResult && parsedResult["error"]) {
      throw new Error("Unknown error, please see console.log");
    }
    return parsedResult;
  }
  /**
   * Push a new task to taskQueue
   */
  pushTask(param, buffers) {
    return new Promise((resolve, reject) => {
      this.taskQueue.push({ resolve, reject, param, buffers });
      this.runTaskLoop();
    });
  }
  /**
   * Main loop for processing tasks
   */
  runTaskLoop() {
    return __async(this, null, function* () {
      var _a;
      if (this.busy) {
        return;
      }
      this.busy = true;
      while (true) {
        const task = this.taskQueue.shift();
        if (!task) break;
        this.resultQueue.push(task);
        this.worker.postMessage(
          task.param,
          isSafariMobile() ? void 0 : {
            transfer: (_a = task.buffers) != null ? _a : []
          }
        );
      }
      this.busy = false;
    });
  }
  /**
   * Handle messages from worker
   */
  onRecvMsg(e) {
    if (!e.data) return;
    const { verb, args } = e.data;
    if (verb && verb.startsWith("console.")) {
      if (this.suppressNativeLog) {
        return;
      }
      if (verb.endsWith("debug")) this.logger.debug(...args);
      if (verb.endsWith("log")) this.logger.log(...args);
      if (verb.endsWith("warn")) this.logger.warn(...args);
      if (verb.endsWith("error")) this.logger.error(...args);
      return;
    } else if (verb === "signal.abort") {
      this.abort(args[0]);
    }
    const { callbackId, result, err } = e.data;
    if (callbackId) {
      const idx = this.resultQueue.findIndex(
        (t) => t.param.callbackId === callbackId
      );
      if (idx !== -1) {
        const waitingTask = this.resultQueue.splice(idx, 1)[0];
        if (err) waitingTask.reject(err);
        else waitingTask.resolve(result);
      } else {
        this.logger.error(
          `Cannot find waiting task with callbackId = ${callbackId}`
        );
      }
    }
  }
  abort(text) {
    while (this.resultQueue.length > 0) {
      const waitingTask = this.resultQueue.pop();
      if (!waitingTask) break;
      waitingTask.reject(
        new Error(
          `Received abort signal from llama.cpp; Message: ${text || "(empty)"}`
        )
      );
    }
  }
};

// src/cache-manager.ts
var PREFIX_METADATA = "__metadata__";
var POLYFILL_ETAG = "polyfill_for_older_version";
var CacheManager = class {
  /**
   * Convert a given URL into file name in cache.
   *
   * Format of the file name: `${hashSHA1(fullURL)}_${fileName}`
   */
  getNameFromURL(url) {
    return __async(this, null, function* () {
      return yield urlToFileName(url, "");
    });
  }
  /**
   * @deprecated Use `download()` instead
   *
   * Write a new file to cache. This will overwrite existing file.
   *
   * @param name The file name returned by `getNameFromURL()` or `list()`
   */
  write(name, stream, metadata) {
    return __async(this, null, function* () {
      this.writeMetadata(name, metadata);
      return yield opfsWrite(name, stream);
    });
  }
  download(_0) {
    return __async(this, arguments, function* (url, options = {}) {
      const worker = createWorker(OPFS_UTILS_WORKER_CODE);
      let aborted = false;
      if (options.signal) {
        aborted = options.signal.aborted;
        const mSignal = options.signal;
        mSignal.addEventListener("abort", () => {
          aborted = true;
          worker.postMessage({ action: "download-abort" });
        });
        delete options.signal;
      }
      const metadataFileName = yield urlToFileName(url, PREFIX_METADATA);
      const filename = yield urlToFileName(url, "");
      return yield new Promise((resolve, reject) => {
        worker.postMessage({
          action: "download",
          url,
          filename,
          metadataFileName,
          options: { headers: options.headers, aborted }
        });
        worker.onmessage = (e) => {
          var _a;
          if (e.data.ok) {
            worker.terminate();
            resolve();
          } else if (e.data.err) {
            worker.terminate();
            reject(e.data.err);
          } else if (e.data.progress) {
            const progress = e.data.progress;
            (_a = options.progressCallback) == null ? void 0 : _a.call(options, progress);
          } else {
            reject(new Error("Unknown message from worker"));
            console.error("Unknown message from worker", e.data);
          }
        };
      });
    });
  }
  /**
   * Open a file in cache for reading
   *
   * @param nameOrURL The file name returned by `getNameFromURL()` or `list()`, or the original URL of the remote file
   * @returns Blob, or null if file does not exist
   */
  open(nameOrURL) {
    return __async(this, null, function* () {
      return yield opfsOpen(nameOrURL);
    });
  }
  /**
   * Get the size of a file in stored cache
   *
   * NOTE: in case the download is stopped mid-way (i.e. user close browser tab), the file maybe corrupted, size maybe different from `metadata.originalSize`
   *
   * @param name The file name returned by `getNameFromURL()` or `list()`
   * @returns number of bytes, or -1 if file does not exist
   */
  getSize(name) {
    return __async(this, null, function* () {
      return yield opfsFileSize(name);
    });
  }
  /**
   * Get metadata of a cached file
   */
  getMetadata(name) {
    return __async(this, null, function* () {
      const stream = yield opfsOpen(name, PREFIX_METADATA);
      const cachedSize = yield this.getSize(name);
      if (!stream) {
        return cachedSize > 0 ? (
          // files created by older version of wllama doesn't have metadata, we will try to polyfill it
          {
            etag: POLYFILL_ETAG,
            originalSize: cachedSize,
            originalURL: ""
          }
        ) : (
          // if cached file not found, we don't have metadata at all
          null
        );
      }
      try {
        const meta = yield new Response(stream).json();
        return meta;
      } catch (e) {
        return null;
      }
    });
  }
  /**
   * List all files currently in cache
   */
  list() {
    return __async(this, null, function* () {
      const cacheDir = yield getCacheDir();
      const result = [];
      const metadataMap = {};
      try {
        for (var iter = __forAwait(cacheDir.entries()), more, temp, error; more = !(temp = yield iter.next()).done; more = false) {
          let [name, handler] = temp.value;
          if (handler.kind === "file" && name.startsWith(PREFIX_METADATA)) {
            const stream = (yield handler.getFile()).stream();
            const meta = yield new Response(stream).json().catch((_) => null);
            metadataMap[name.replace(PREFIX_METADATA, "")] = meta;
          }
        }
      } catch (temp) {
        error = [temp];
      } finally {
        try {
          more && (temp = iter.return) && (yield temp.call(iter));
        } finally {
          if (error)
            throw error[0];
        }
      }
      try {
        for (var iter2 = __forAwait(cacheDir.entries()), more2, temp2, error2; more2 = !(temp2 = yield iter2.next()).done; more2 = false) {
          let [name, handler] = temp2.value;
          if (handler.kind === "file" && !name.startsWith(PREFIX_METADATA)) {
            result.push({
              name,
              size: yield handler.getFile().then((f) => f.size),
              metadata: metadataMap[name] || {
                // try to polyfill for old versions
                originalSize: (yield handler.getFile()).size,
                originalURL: "",
                etag: ""
              }
            });
          }
        }
      } catch (temp2) {
        error2 = [temp2];
      } finally {
        try {
          more2 && (temp2 = iter2.return) && (yield temp2.call(iter2));
        } finally {
          if (error2)
            throw error2[0];
        }
      }
      return result;
    });
  }
  /**
   * Clear all files currently in cache
   */
  clear() {
    return __async(this, null, function* () {
      yield this.deleteMany(() => true);
    });
  }
  /**
   * Delete a single file in cache
   *
   * @param nameOrURL Can be either an URL or a name returned by `getNameFromURL()` or `list()`
   */
  delete(nameOrURL) {
    return __async(this, null, function* () {
      const name2 = yield this.getNameFromURL(nameOrURL);
      yield this.deleteMany(
        (entry) => entry.name === nameOrURL || entry.name === name2
      );
    });
  }
  /**
   * Delete multiple files in cache.
   *
   * @param predicate A predicate like `array.filter(item => boolean)`
   */
  deleteMany(predicate) {
    return __async(this, null, function* () {
      const cacheDir = yield getCacheDir();
      const list = yield this.list();
      for (const item of list) {
        if (predicate(item)) {
          cacheDir.removeEntry(item.name);
        }
      }
    });
  }
  /**
   * Write the metadata of the file to disk.
   *
   * This function is separated from `write()` for compatibility reason. In older version of wllama, there was no metadata for cached file, so when newer version of wllama loads a file created by older version, it will try to polyfill the metadata.
   */
  writeMetadata(name, metadata) {
    return __async(this, null, function* () {
      const blob = new Blob([JSON.stringify(metadata)], { type: "text/plain" });
      yield opfsWrite(name, blob.stream(), PREFIX_METADATA);
    });
  }
};
var cache_manager_default = CacheManager;
function opfsWrite(key, stream, prefix = "") {
  return __async(this, null, function* () {
    try {
      const fileName = yield urlToFileName(key, prefix);
      const writable = yield opfsWriteViaWorker(fileName);
      yield writable.truncate(0);
      const reader = stream.getReader();
      while (true) {
        const { done, value } = yield reader.read();
        if (done) break;
        yield writable.write(value);
      }
      yield writable.close();
    } catch (e) {
      console.error("opfsWrite", e);
    }
  });
}
function opfsOpen(originalURLOrName, prefix = "") {
  return __async(this, null, function* () {
    const getFileHandler = (fname) => __async(this, null, function* () {
      try {
        const cacheDir = yield getCacheDir();
        const fileHandler = yield cacheDir.getFileHandle(fname);
        return yield fileHandler.getFile();
      } catch (e) {
        return null;
      }
    });
    let handler = yield getFileHandler(originalURLOrName);
    if (handler) {
      return handler;
    }
    const fileName = yield urlToFileName(originalURLOrName, prefix);
    handler = yield getFileHandler(fileName);
    return handler;
  });
}
function opfsFileSize(originalURL, prefix = "") {
  return __async(this, null, function* () {
    try {
      const cacheDir = yield getCacheDir();
      const fileName = yield urlToFileName(originalURL, prefix);
      const fileHandler = yield cacheDir.getFileHandle(fileName);
      const file = yield fileHandler.getFile();
      return file.size;
    } catch (e) {
      return -1;
    }
  });
}
function urlToFileName(url, prefix) {
  return __async(this, null, function* () {
    const hashBuffer = yield crypto.subtle.digest(
      "SHA-1",
      new TextEncoder().encode(url)
    );
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    return `${prefix}${hashHex}_${url.split("/").pop()}`;
  });
}
function getCacheDir() {
  return __async(this, null, function* () {
    const opfsRoot = yield navigator.storage.getDirectory();
    const cacheDir = yield opfsRoot.getDirectoryHandle("cache", { create: true });
    return cacheDir;
  });
}
function opfsWriteViaWorker(fileName) {
  return __async(this, null, function* () {
    const worker = createWorker(OPFS_UTILS_WORKER_CODE);
    let pResolve;
    let pReject;
    worker.onmessage = (e) => {
      if (e.data.ok) pResolve(null);
      else if (e.data.err) pReject(e.data.err);
    };
    const workerExec = (data) => new Promise((resolve, reject) => {
      pResolve = resolve;
      pReject = reject;
      worker.postMessage(
        data,
        isSafariMobile() ? void 0 : {
          transfer: data.value ? [data.value.buffer] : []
        }
      );
    });
    yield workerExec({ open: fileName });
    return {
      truncate: () => __async(this, null, function* () {
      }),
      write: (value) => workerExec({ value }),
      close: () => __async(this, null, function* () {
        yield workerExec({ done: true });
        worker.terminate();
      })
    };
  });
}

// src/model-manager.ts
var DEFAULT_PARALLEL_DOWNLOADS = 3;
var ModelValidationStatus = /* @__PURE__ */ ((ModelValidationStatus2) => {
  ModelValidationStatus2["VALID"] = "valid";
  ModelValidationStatus2["INVALID"] = "invalid";
  ModelValidationStatus2["DELETED"] = "deleted";
  return ModelValidationStatus2;
})(ModelValidationStatus || {});
var Model = class {
  constructor(modelManager, url, savedFiles) {
    __publicField(this, "modelManager");
    /**
     * URL to the GGUF file (in case it contains multiple shards, the URL should point to the first shard)
     *
     * This URL will be used to identify the model in the cache. There can't be 2 models with the same URL.
     */
    __publicField(this, "url");
    /**
     * Size in bytes (total size of all shards).
     *
     * A value of -1 means the model is deleted from the cache. You must call `ModelManager.downloadModel` to re-download the model.
     */
    __publicField(this, "size");
    /**
     * List of all shards in the cache, sorted by original URL (ascending order)
     */
    __publicField(this, "files");
    this.modelManager = modelManager;
    this.url = url;
    if (savedFiles) {
      this.files = this.getAllFiles(savedFiles);
      this.size = sumArr(this.files.map((f) => f.metadata.originalSize));
    } else {
      this.files = [];
      this.size = 0;
    }
  }
  /**
   * Open and get a list of all shards as Blobs
   */
  open() {
    return __async(this, null, function* () {
      if (this.size === -1) {
        throw new WllamaError(
          `Model is deleted from the cache; Call ModelManager.downloadModel to re-download the model`,
          "load_error"
        );
      }
      const blobs = [];
      for (const file of this.files) {
        const blob = yield this.modelManager.cacheManager.open(file.name);
        if (!blob) {
          throw new Error(
            `Failed to open file ${file.name}; Hint: the model may be invalid, please refresh it`
          );
        }
        blobs.push(blob);
      }
      return blobs;
    });
  }
  /**
   * Validate the model files.
   *
   * If the model is invalid, the model manager will not be able to use it. You must call `refresh` to re-download the model.
   *
   * Cases that model is invalid:
   * - The model is deleted from the cache
   * - The model files are missing (or the download is interrupted)
   */
  validate() {
    const nbShards = ModelManager.parseModelUrl(this.url).length;
    if (this.size === -1) {
      return "deleted" /* DELETED */;
    }
    if (this.size < 16 || this.files.length !== nbShards) {
      return "invalid" /* INVALID */;
    }
    for (const file of this.files) {
      if (!file.metadata || file.metadata.originalSize !== file.size) {
        return "invalid" /* INVALID */;
      }
    }
    return "valid" /* VALID */;
  }
  /**
   * In case the model is invalid, call this function to re-download the model
   */
  refresh() {
    return __async(this, arguments, function* (options = {}) {
      var _a;
      const urls = ModelManager.parseModelUrl(this.url);
      const works = urls.map((url, index) => ({
        url,
        index
      }));
      this.modelManager.logger.debug("Downloading model files:", urls);
      const nParallel = (_a = this.modelManager.params.parallelDownloads) != null ? _a : DEFAULT_PARALLEL_DOWNLOADS;
      const totalSize = yield this.getTotalDownloadSize(urls);
      const loadedSize = [];
      const worker = () => __async(this, null, function* () {
        while (works.length > 0) {
          const w = works.shift();
          if (!w) break;
          yield this.modelManager.cacheManager.download(w.url, __spreadProps(__spreadValues({}, options), {
            progressCallback: ({ loaded }) => {
              var _a2;
              loadedSize[w.index] = loaded;
              (_a2 = options.progressCallback) == null ? void 0 : _a2.call(options, {
                loaded: sumArr(loadedSize),
                total: totalSize
              });
            }
          }));
        }
      });
      const promises = [];
      for (let i = 0; i < nParallel; i++) {
        promises.push(worker());
        loadedSize.push(0);
      }
      yield Promise.all(promises);
      this.files = this.getAllFiles(yield this.modelManager.cacheManager.list());
      this.size = this.files.reduce((acc, f) => acc + f.metadata.originalSize, 0);
    });
  }
  /**
   * Remove the model from the cache
   */
  remove() {
    return __async(this, null, function* () {
      this.files = this.getAllFiles(yield this.modelManager.cacheManager.list());
      yield this.modelManager.cacheManager.deleteMany(
        (f) => !!this.files.find((file) => file.name === f.name)
      );
      this.size = -1;
    });
  }
  getAllFiles(savedFiles) {
    const allUrls = new Set(ModelManager.parseModelUrl(this.url));
    const allFiles = [];
    for (const url of allUrls) {
      const file = savedFiles.find((f) => f.metadata.originalURL === url);
      if (!file) {
        throw new Error(`Model file not found: ${url}`);
      }
      allFiles.push(file);
    }
    allFiles.sort(
      (a, b) => a.metadata.originalURL.localeCompare(b.metadata.originalURL)
    );
    return allFiles;
  }
  getTotalDownloadSize(urls) {
    return __async(this, null, function* () {
      const responses = yield Promise.all(
        urls.map((url) => fetch(url, { method: "HEAD" }))
      );
      const sizes = responses.map(
        (res) => Number(res.headers.get("content-length") || "0")
      );
      return sumArr(sizes);
    });
  }
};
var ModelManager = class _ModelManager {
  constructor(params = {}) {
    // The CacheManager singleton, can be accessed by user
    __publicField(this, "cacheManager");
    __publicField(this, "params");
    __publicField(this, "logger");
    this.cacheManager = params.cacheManager || new cache_manager_default();
    this.params = params;
    this.logger = params.logger || console;
  }
  /**
   * Parses a model URL and returns an array of URLs based on the following patterns:
   * - If the input URL is an array, it returns the array itself.
   * - If the input URL is a string in the `gguf-split` format, it returns an array containing the URL of each shard in ascending order.
   * - Otherwise, it returns an array containing the input URL as a single element array.
   * @param modelUrl URL or list of URLs
   */
  static parseModelUrl(modelUrl) {
    var _a;
    if (Array.isArray(modelUrl)) {
      return modelUrl;
    }
    const urlPartsRegex = /-(\d{5})-of-(\d{5})\.gguf(?:\?.*)?$/;
    const queryMatch = modelUrl.match(/\.gguf(\?.*)?$/);
    const queryParams = (_a = queryMatch == null ? void 0 : queryMatch[1]) != null ? _a : "";
    const matches = modelUrl.match(urlPartsRegex);
    if (!matches) {
      return [modelUrl];
    }
    const baseURL = modelUrl.replace(urlPartsRegex, "");
    const total = matches[2];
    const paddedShardIds = Array.from(
      { length: Number(total) },
      (_, index) => (index + 1).toString().padStart(5, "0")
    );
    return paddedShardIds.map(
      (current) => `${baseURL}-${current}-of-${total}.gguf${queryParams}`
    );
  }
  /**
   * Get all models in the cache
   */
  getModels() {
    return __async(this, arguments, function* (opts = {}) {
      const cachedFiles = yield this.cacheManager.list();
      let models = [];
      for (const file of cachedFiles) {
        const shards = _ModelManager.parseModelUrl(file.metadata.originalURL);
        const isFirstShard = shards.length === 1 || shards[0] === file.metadata.originalURL;
        if (isFirstShard) {
          models.push(new Model(this, file.metadata.originalURL, cachedFiles));
        }
      }
      if (!opts.includeInvalid) {
        models = models.filter(
          (m) => m.validate() === "valid" /* VALID */
        );
      }
      return models;
    });
  }
  /**
   * Download a model from the given URL.
   *
   * The URL must end with `.gguf`
   */
  downloadModel(_0) {
    return __async(this, arguments, function* (url, options = {}) {
      if (!isValidGgufFile(url)) {
        throw new WllamaError(
          `Invalid model URL: ${url}; URL must ends with ".gguf"`,
          "download_error"
        );
      }
      const model = new Model(this, url, void 0);
      const validity = model.validate();
      if (validity !== "valid" /* VALID */) {
        yield model.refresh(options);
      }
      return model;
    });
  }
  /**
   * Get a model from the cache or download it if it's not available.
   */
  getModelOrDownload(_0) {
    return __async(this, arguments, function* (url, options = {}) {
      var _a;
      const models = yield this.getModels();
      const model = models.find((m) => m.url === url);
      if (model) {
        (_a = options.progressCallback) == null ? void 0 : _a.call(options, { loaded: model.size, total: model.size });
        return model;
      }
      return this.downloadModel(url, options);
    });
  }
  /**
   * Remove all models from the cache
   */
  clear() {
    return __async(this, null, function* () {
      yield this.cacheManager.clear();
    });
  }
};

// src/wllama.ts
var HF_MODEL_ID_REGEX = /^([a-zA-Z0-9_\-\.]+)\/([a-zA-Z0-9_\-\.]+)$/;
var HF_MODEL_ID_REGEX_EXPLAIN = "Hugging Face model ID is incorrect. Only regular alphanumeric characters, '-', '.' and '_' supported";
var LoggerWithoutDebug = __spreadProps(__spreadValues({}, console), {
  debug: () => {
  }
});
var WllamaError = class extends Error {
  constructor(message, type = "unknown_error") {
    super(message);
    __publicField(this, "type");
    this.type = type;
  }
};
var WllamaAbortError = class extends Error {
  constructor() {
    super("Operation aborted");
    __publicField(this, "name", "AbortError");
  }
};
var Wllama = class {
  constructor(pathConfig, wllamaConfig = {}) {
    // The CacheManager and ModelManager are singleton, can be accessed by user
    __publicField(this, "cacheManager");
    __publicField(this, "modelManager");
    __publicField(this, "proxy", null);
    __publicField(this, "config");
    __publicField(this, "pathConfig");
    __publicField(this, "useMultiThread", false);
    __publicField(this, "nbThreads", 1);
    __publicField(this, "useEmbeddings", false);
    // available when loaded
    __publicField(this, "loadedContextInfo", null);
    __publicField(this, "bosToken", -1);
    __publicField(this, "eosToken", -1);
    __publicField(this, "eotToken", -1);
    __publicField(this, "eogTokens", /* @__PURE__ */ new Set());
    __publicField(this, "addBosToken", false);
    __publicField(this, "addEosToken", false);
    __publicField(this, "chatTemplate");
    __publicField(this, "metadata");
    __publicField(this, "samplingConfig", {});
    __publicField(this, "hasEncoder", false);
    __publicField(this, "decoderStartToken", -1);
    __publicField(this, "nCachedTokens", 0);
    var _a, _b, _c;
    checkEnvironmentCompatible();
    if (!pathConfig) throw new WllamaError("AssetsPathConfig is required");
    this.pathConfig = pathConfig;
    this.config = wllamaConfig;
    this.cacheManager = (_a = wllamaConfig.cacheManager) != null ? _a : new cache_manager_default();
    this.modelManager = (_c = wllamaConfig.modelManager) != null ? _c : new ModelManager({
      cacheManager: this.cacheManager,
      logger: (_b = wllamaConfig.logger) != null ? _b : console,
      parallelDownloads: wllamaConfig.parallelDownloads,
      allowOffline: wllamaConfig.allowOffline
    });
  }
  logger() {
    var _a;
    return (_a = this.config.logger) != null ? _a : console;
  }
  checkModelLoaded() {
    if (!this.isModelLoaded()) {
      throw new WllamaError(
        "loadModel() is not yet called",
        "model_not_loaded"
      );
    }
  }
  /**
   * Get the libllama version string, e.g. "b6327-4d74393".
   *
   * @returns version string embedded at build time.
   */
  static getLibllamaVersion() {
    return LIBLLAMA_VERSION;
  }
  /**
   * Check if the model is loaded via `loadModel()`
   */
  isModelLoaded() {
    return !!this.proxy && !!this.metadata;
  }
  /**
   * Get token ID associated to BOS (begin of sentence) token.
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns -1 if the model is not loaded.
   */
  getBOS() {
    return this.bosToken;
  }
  /**
   * Get token ID associated to EOS (end of sentence) token.
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns -1 if the model is not loaded.
   */
  getEOS() {
    return this.eosToken;
  }
  /**
   * Get token ID associated to EOT (end of turn) token.
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns -1 if the model is not loaded.
   */
  getEOT() {
    return this.eotToken;
  }
  /**
   * Check if a given token is end-of-generation token (e.g. EOS, EOT, etc.)
   *
   * @param token the token ID to be checked
   * @returns true if the token is EOS, EOT, or any other end-of-generation tokens
   */
  isTokenEOG(token) {
    return token === this.eosToken || token === this.eotToken || this.eogTokens.has(token);
  }
  /**
   * Get token ID associated to token used by decoder, to start generating output sequence(only usable for encoder-decoder architecture). In other words, encoder uses normal BOS and decoder uses this token.
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns -1 if the model is not loaded.
   */
  getDecoderStartToken() {
    return this.decoderStartToken;
  }
  /**
   * Get model hyper-parameters and metadata
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns ModelMetadata
   */
  getModelMetadata() {
    this.checkModelLoaded();
    return this.metadata;
  }
  /**
   * Check if we're currently using multi-thread build.
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns true if multi-thread is used.
   */
  isMultithread() {
    this.checkModelLoaded();
    return this.useMultiThread;
  }
  /**
   * Get number of threads used in the current context.
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns number of threads
   */
  getNumThreads() {
    this.checkModelLoaded();
    return this.useMultiThread ? this.nbThreads : 1;
  }
  /**
   * Check if the current model uses encoder-decoder architecture
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns true if multi-thread is used.
   */
  isEncoderDecoderArchitecture() {
    this.checkModelLoaded();
    return this.hasEncoder;
  }
  /**
   * Must we add BOS token to the tokenized sequence?
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns true if BOS token must be added to the sequence
   */
  mustAddBosToken() {
    this.checkModelLoaded();
    return this.addBosToken;
  }
  /**
   * Must we add EOS token to the tokenized sequence?
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns true if EOS token must be added to the sequence
   */
  mustAddEosToken() {
    this.checkModelLoaded();
    return this.addEosToken;
  }
  /**
   * Get the jinja chat template comes with the model. It only available if the original model (before converting to gguf) has the template in `tokenizer_config.json`
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns the jinja template. null if there is no template in gguf
   */
  getChatTemplate() {
    var _a;
    this.checkModelLoaded();
    return (_a = this.chatTemplate) != null ? _a : null;
  }
  /**
   * Load model from a given URL (or a list of URLs, in case the model is splitted into smaller files)
   * - If the model already been downloaded (via `downloadModel()`), then we will use the cached model
   * - Else, we download the model from internet
   * @param modelUrl URL to the GGUF file. If the model is splitted, pass the URL to the first shard.
   * @param config
   */
  loadModelFromUrl(_0) {
    return __async(this, arguments, function* (modelUrl, config = {}) {
      var _a;
      const url = isString(modelUrl) ? modelUrl : modelUrl[0];
      const useCache = (_a = config.useCache) != null ? _a : true;
      const model = useCache ? yield this.modelManager.getModelOrDownload(url, config) : yield this.modelManager.downloadModel(url, config);
      const blobs = yield model.open();
      return yield this.loadModel(blobs, config);
    });
  }
  /**
   * Load model from a given Hugging Face model ID and file path.
   *
   * @param modelId The HF model ID, for example: 'ggml-org/models'
   * @param filePath The GGUF file path, for example: 'tinyllamas/stories15M-q4_0.gguf'
   * @param config
   */
  loadModelFromHF(_0, _1) {
    return __async(this, arguments, function* (modelId, filePath, config = {}) {
      if (!modelId.match(HF_MODEL_ID_REGEX)) {
        throw new WllamaError(HF_MODEL_ID_REGEX_EXPLAIN, "download_error");
      }
      if (!isValidGgufFile(filePath)) {
        throw new WllamaError("Only GGUF file is supported", "download_error");
      }
      return yield this.loadModelFromUrl(
        `https://huggingface.co/${modelId}/resolve/main/${filePath}`,
        config
      );
    });
  }
  /**
   * Load model from a given list of Blob.
   *
   * You can pass multiple buffers into the function (in case the model contains multiple shards).
   *
   * @param ggufBlobsOrModel Can be either list of Blobs (in case you use local file), or a Model object (in case you use ModelManager)
   * @param config LoadModelConfig
   */
  loadModel(_0) {
    return __async(this, arguments, function* (ggufBlobsOrModel, config = {}) {
      var _a, _b;
      const blobs = ggufBlobsOrModel instanceof Model ? yield ggufBlobsOrModel.open() : [...ggufBlobsOrModel];
      if (blobs.some((b) => b.size === 0)) {
        throw new WllamaError(
          "Input model (or splits) must be non-empty Blob or File",
          "load_error"
        );
      }
      sortFileByShard(blobs);
      if (this.proxy) {
        throw new WllamaError("Module is already initialized", "load_error");
      }
      const supportMultiThread = yield isSupportMultiThread();
      if (!supportMultiThread) {
        this.logger().warn(
          "Multi-threads are not supported in this environment, falling back to single-thread"
        );
      }
      const hasPathMultiThread = !!this.pathConfig["multi-thread/wllama.wasm"];
      if (!hasPathMultiThread) {
        this.logger().warn(
          'Missing paths to "multi-thread/wllama.wasm", falling back to single-thread'
        );
      }
      const hwConccurency = Math.floor((navigator.hardwareConcurrency || 1) / 2);
      const nbThreads = (_a = config.n_threads) != null ? _a : hwConccurency;
      this.nbThreads = nbThreads;
      this.useMultiThread = supportMultiThread && hasPathMultiThread && nbThreads > 1;
      const mPathConfig = this.useMultiThread ? {
        "wllama.wasm": absoluteUrl(
          this.pathConfig["multi-thread/wllama.wasm"]
        )
      } : {
        "wllama.wasm": absoluteUrl(
          this.pathConfig["single-thread/wllama.wasm"]
        )
      };
      this.proxy = new ProxyToWorker(
        mPathConfig,
        this.useMultiThread ? nbThreads : 1,
        (_b = this.config.suppressNativeLog) != null ? _b : false,
        this.logger()
      );
      const modelFiles = blobs.map((blob, i) => ({
        name: `model-${i}.gguf`,
        blob
      }));
      yield this.proxy.moduleInit(modelFiles);
      const startResult = yield this.proxy.wllamaStart();
      if (!startResult.success) {
        throw new WllamaError(
          `Error while calling start function, result = ${startResult}`
        );
      }
      const loadResult = yield this.proxy.wllamaAction("load", {
        _name: "load_req",
        use_mmap: true,
        use_mlock: true,
        n_gpu_layers: 0,
        // not supported for now
        seed: config.seed || Math.floor(Math.random() * 1e5),
        n_ctx: config.n_ctx || 1024,
        n_threads: this.useMultiThread ? nbThreads : 1,
        n_ctx_auto: false,
        // not supported for now
        model_paths: modelFiles.map((f) => `models/${f.name}`),
        embeddings: config.embeddings,
        offload_kqv: config.offload_kqv,
        n_batch: config.n_batch,
        pooling_type: config.pooling_type,
        rope_scaling_type: config.rope_scaling_type,
        rope_freq_base: config.rope_freq_base,
        rope_freq_scale: config.rope_freq_scale,
        yarn_ext_factor: config.yarn_ext_factor,
        yarn_attn_factor: config.yarn_attn_factor,
        yarn_beta_fast: config.yarn_beta_fast,
        yarn_beta_slow: config.yarn_beta_slow,
        yarn_orig_ctx: config.yarn_orig_ctx,
        cache_type_k: config.cache_type_k,
        cache_type_v: config.cache_type_v,
        n_seq_max: 1,
        // only support single sequence for now
        flash_attn: config.flash_attn,
        swa_full: true
        // TODO: properly support SWA
      });
      const loadedCtxInfo = __spreadProps(__spreadValues({}, loadResult), {
        metadata: {}
      });
      for (let i = 0; i < loadResult.metadata_key.length; i++) {
        loadedCtxInfo.metadata[loadResult.metadata_key[i]] = loadResult.metadata_val[i];
      }
      this.bosToken = loadedCtxInfo.token_bos;
      this.eosToken = loadedCtxInfo.token_eos;
      this.eotToken = loadedCtxInfo.token_eot;
      this.useEmbeddings = !!config.embeddings;
      this.metadata = {
        hparams: {
          nVocab: loadedCtxInfo.n_vocab,
          nCtxTrain: loadedCtxInfo.n_ctx_train,
          nEmbd: loadedCtxInfo.n_embd,
          nLayer: loadedCtxInfo.n_layer
        },
        meta: loadedCtxInfo.metadata
      };
      this.hasEncoder = !!loadedCtxInfo.has_encoder;
      this.decoderStartToken = loadedCtxInfo.token_decoder_start;
      this.addBosToken = loadedCtxInfo.add_bos_token;
      this.addEosToken = loadedCtxInfo.add_eos_token;
      this.chatTemplate = loadedCtxInfo.metadata["tokenizer.chat_template"];
      this.loadedContextInfo = loadedCtxInfo;
      this.eogTokens = new Set(loadedCtxInfo.list_tokens_eog);
      this.logger().debug({ loadedCtxInfo });
    });
  }
  getLoadedContextInfo() {
    this.checkModelLoaded();
    if (!this.loadedContextInfo) {
      throw new WllamaError("Loaded context info is not available");
    }
    return __spreadValues({}, this.loadedContextInfo);
  }
  //////////////////////////////////////////////
  // High level API
  /**
   * Calculate embedding vector for a given text.
   * By default, BOS and EOS tokens will be added automatically. You can use the "skipBOS" and "skipEOS" option to disable it.
   * @param text Input text
   * @returns An embedding vector
   */
  createEmbedding(_0) {
    return __async(this, arguments, function* (text, options = {}) {
      this.checkModelLoaded();
      const opt = __spreadValues({
        skipBOS: false,
        skipEOS: false
      }, options);
      yield this.samplingInit(this.samplingConfig);
      yield this.kvClear();
      const tokens = yield this.tokenize(text);
      if (this.bosToken && !opt.skipBOS) {
        tokens.unshift(this.bosToken);
      }
      if (this.eosToken && !opt.skipEOS) {
        tokens.push(this.eosToken);
      }
      const result = yield this.embeddings(tokens);
      return result;
    });
  }
  createChatCompletion(messages, options) {
    return __async(this, null, function* () {
      const prompt = yield this.formatChat(messages, true);
      return options.stream ? yield this.createCompletionGenerator(prompt, options) : yield this.createCompletion(prompt, __spreadProps(__spreadValues({}, options), { stream: false }));
    });
  }
  createCompletion(prompt, options) {
    return __async(this, null, function* () {
      return options.stream ? yield this.createCompletionGenerator(prompt, options) : yield this.createCompletionImpl(prompt, __spreadProps(__spreadValues({}, options), { stream: false }));
    });
  }
  /**
   * Private implementation of createCompletion
   */
  createCompletionImpl(prompt, options) {
    return __async(this, null, function* () {
      var _a, _b, _c, _d;
      this.checkModelLoaded();
      this.samplingConfig = (_a = options.sampling) != null ? _a : {};
      yield this.samplingInit(this.samplingConfig);
      const stopTokens = new Set((_b = options.stopTokens) != null ? _b : []);
      let tokens = yield this.tokenize(prompt, true);
      if (this.addBosToken && tokens[0] !== this.bosToken) {
        tokens.unshift(this.bosToken);
      }
      if (options.useCache) {
        tokens = yield this.computeNonCachedTokens(tokens);
      } else {
        yield this.kvClear();
      }
      yield this.samplingAccept(tokens);
      if (this.isEncoderDecoderArchitecture()) {
        yield this.encode(tokens);
        yield this.decode([this.getDecoderStartToken()], {});
      } else {
        yield this.decode(tokens, {});
      }
      let outBuf = new Uint8Array();
      let abort = false;
      const abortSignalFn = () => {
        abort = true;
      };
      for (let i = 0; i < ((_c = options.nPredict) != null ? _c : Infinity); i++) {
        const sampled = yield this.samplingSample();
        if (this.isTokenEOG(sampled.token) || stopTokens.has(sampled.token)) {
          break;
        }
        outBuf = joinBuffers([outBuf, sampled.piece]);
        if (options.onNewToken) {
          options.onNewToken(sampled.token, sampled.piece, bufToText(outBuf), {
            abortSignal: abortSignalFn
            // legacy
          });
        }
        if (abort || ((_d = options.abortSignal) == null ? void 0 : _d.aborted)) {
          break;
        }
        yield this.samplingAccept([sampled.token]);
        yield this.decode([sampled.token], {});
      }
      return bufToText(outBuf);
    });
  }
  /**
   * Same with `createCompletion`, but returns an async iterator instead.
   */
  createCompletionGenerator(prompt, options) {
    return new Promise((resolve, reject) => {
      const createGenerator = cbToAsyncIter(
        (callback) => {
          this.createCompletionImpl(prompt, __spreadProps(__spreadValues({}, options), {
            onNewToken: (token, piece, currentText) => {
              callback({ token, piece, currentText }, false);
            }
          })).catch(reject).then(() => {
            callback(void 0, true);
          });
        }
      );
      resolve(createGenerator());
    });
  }
  //////////////////////////////////////////////
  // Low level API
  /**
   * Create or reset the ctx_sampling
   * @param config
   * @param pastTokens In case re-initializing the ctx_sampling, you can re-import past tokens into the new context
   */
  samplingInit(_0) {
    return __async(this, arguments, function* (config, pastTokens = []) {
      var _a;
      this.checkModelLoaded();
      this.samplingConfig = config;
      const logitBias = (_a = config.logit_bias) != null ? _a : [];
      const logitBiasTok = logitBias.map((b) => b.token);
      const logitBiasVal = logitBias.map((b) => b.bias);
      const result = yield this.proxy.wllamaAction(
        "sampling_init",
        __spreadProps(__spreadValues({
          _name: "sint_req"
        }, config), {
          logit_bias_toks: logitBiasTok,
          logit_bias_vals: logitBiasVal,
          tokens: pastTokens
        })
      );
      if (!result.success) {
        throw new WllamaError("Failed to initialize sampling");
      }
    });
  }
  /**
   * Get a list of pieces in vocab.
   * NOTE: This function is slow, should only be used once.
   * @returns A list of Uint8Array. The nth element in the list associated to nth token in vocab
   */
  getVocab() {
    return __async(this, null, function* () {
      this.checkModelLoaded();
      const result = yield this.proxy.wllamaAction(
        "get_vocab",
        {
          _name: "gvoc_req"
        }
      );
      return result.vocab;
    });
  }
  /**
   * Lookup to see if a token exist in vocab or not. Useful for searching special tokens like "<|im_start|>"
   * NOTE: It will match the whole token, so do not use it as a replacement for tokenize()
   * @param piece
   * @returns Token ID associated to the given piece. Returns -1 if cannot find the token.
   */
  lookupToken(piece) {
    return __async(this, null, function* () {
      this.checkModelLoaded();
      const result = yield this.proxy.wllamaAction(
        "lookup_token",
        {
          _name: "lkup_req",
          piece
        }
      );
      if (!result.success) {
        return -1;
      } else {
        return result.token;
      }
    });
  }
  /**
   * Convert a given text to list of tokens
   * @param text
   * @param special Should split special tokens?
   * @returns List of token ID
   */
  tokenize(text, special = true) {
    return __async(this, null, function* () {
      this.checkModelLoaded();
      const result = yield this.proxy.wllamaAction(
        "tokenize",
        {
          _name: "tokn_req",
          text,
          special: !!special
        }
      );
      return result.tokens;
    });
  }
  detokenize(tokens, returnString = false) {
    return __async(this, null, function* () {
      this.checkModelLoaded();
      const result = yield this.proxy.wllamaAction(
        "detokenize",
        {
          _name: "dtkn_req",
          tokens
        }
      );
      return returnString ? bufToText(result.buffer) : result.buffer;
    });
  }
  /**
   * Run llama_decode()
   * @param tokens A list of tokens to be decoded
   * @param options Additional options
   * @returns n_past (number of tokens so far in the sequence)
   */
  decode(tokens, options) {
    return __async(this, null, function* () {
      var _a;
      this.checkModelLoaded();
      if (this.useEmbeddings) {
        throw new WllamaError(
          "embeddings is enabled. Use wllama.setOptions({ embeddings: false }) to disable it."
        );
      }
      if (tokens.length === 0) {
        return {
          nPast: this.nCachedTokens
        };
      }
      if (this.nCachedTokens + tokens.length > this.loadedContextInfo.n_ctx) {
        throw new WllamaError(
          "Running out of context cache. Please increase n_ctx when loading the model",
          "kv_cache_full"
        );
      }
      const batches = this.breakTokensIntoBatches(
        tokens,
        this.loadedContextInfo.n_batch
      );
      let result;
      for (let i = 0; i < batches.length; i++) {
        if ((_a = options == null ? void 0 : options.abortSignal) == null ? void 0 : _a.aborted) {
          throw new WllamaAbortError();
        }
        const isNotLast = batches.length > 1 && i < batches.length - 1;
        result = yield this.proxy.wllamaAction("decode", {
          _name: "deco_req",
          tokens: batches[i],
          skip_logits: options.skipLogits || isNotLast
        });
        if (result.error) {
          throw new WllamaError(result.error);
        } else if (!result.success) {
          throw new WllamaError("Cannot encode, unknown error");
        }
      }
      this.nCachedTokens = result.n_past;
      return { nPast: result.n_past };
    });
  }
  /**
   * Run llama_encode()
   * @param tokens A list of tokens to be encoded
   * @param options Additional options
   * @returns n_past (number of tokens so far in the sequence)
   */
  encode(tokens, options) {
    return __async(this, null, function* () {
      var _a;
      this.checkModelLoaded();
      if (!this.hasEncoder) {
        throw new WllamaError(
          "This model does not use encoder-decoder architecture.",
          "inference_error"
        );
      }
      if (this.useEmbeddings) {
        throw new WllamaError(
          "embeddings is enabled. Use wllama.setOptions({ embeddings: false }) to disable it.",
          "inference_error"
        );
      }
      if (tokens.length === 0) {
        return {
          nPast: this.nCachedTokens
        };
      }
      if (this.nCachedTokens + tokens.length > this.loadedContextInfo.n_ctx) {
        throw new WllamaError(
          "Running out of context cache. Please increase n_ctx when loading the model",
          "kv_cache_full"
        );
      }
      const batches = this.breakTokensIntoBatches(
        tokens,
        this.loadedContextInfo.n_batch
      );
      let result;
      for (let i = 0; i < batches.length; i++) {
        if ((_a = options == null ? void 0 : options.abortSignal) == null ? void 0 : _a.aborted) {
          throw new WllamaAbortError();
        }
        result = yield this.proxy.wllamaAction("encode", {
          _name: "enco_req",
          tokens: batches[i]
        });
        if (result.error) {
          throw new WllamaError(result.error);
        } else if (!result.success) {
          throw new WllamaError("Cannot encode, unknown error");
        }
      }
      this.nCachedTokens = result.n_past;
      return { nPast: result.n_past };
    });
  }
  breakTokensIntoBatches(tokens, maxBatchSize) {
    const batches = [];
    for (let i = 0; i < tokens.length; i += maxBatchSize) {
      batches.push(tokens.slice(i, i + maxBatchSize));
    }
    return batches;
  }
  /**
   * Sample a new token (remember to samplingInit() at least once before calling this function)
   * @returns the token ID and its detokenized value (which maybe an unfinished unicode)
   */
  samplingSample() {
    return __async(this, null, function* () {
      this.checkModelLoaded();
      const result = yield this.proxy.wllamaAction(
        "sampling_sample",
        {
          _name: "ssam_req"
        }
      );
      return {
        piece: result.piece,
        token: result.token
      };
    });
  }
  /**
   * Accept and save a new token to ctx_sampling
   * @param tokens
   */
  samplingAccept(tokens) {
    return __async(this, null, function* () {
      this.checkModelLoaded();
      const result = yield this.proxy.wllamaAction(
        "sampling_accept",
        {
          _name: "sacc_req",
          tokens
        }
      );
      if (!result.success) {
        throw new WllamaError("samplingAccept unknown error");
      }
    });
  }
  /**
   * Get softmax-ed probability of logits, can be used for custom sampling
   * @param topK Get top K tokens having highest logits value. If topK == -1, we return all n_vocab logits, but this is not recommended because it's slow.
   */
  getLogits(topK = 40) {
    return __async(this, null, function* () {
      this.checkModelLoaded();
      const result = yield this.proxy.wllamaAction(
        "get_logits",
        {
          _name: "glog_req",
          top_k: topK
        }
      );
      const logits = [];
      for (let i = 0; i < result.tokens.length; i++) {
        logits.push({
          token: result.tokens[i],
          p: result.probs[i]
        });
      }
      return logits;
    });
  }
  /**
   * Calculate embeddings for a given list of tokens. Output vector is always normalized
   * @param tokens
   * @returns A list of number represents an embedding vector of N dimensions
   */
  embeddings(tokens) {
    return __async(this, null, function* () {
      this.checkModelLoaded();
      if (!this.useEmbeddings) {
        throw new WllamaError(
          "embeddings is disabled. Use wllama.setOptions({ embeddings: true }) to enable it.",
          "inference_error"
        );
      }
      if (this.nCachedTokens > 0) {
        this.logger().warn(
          "Embeddings: KV cache is not empty, this may produce incorrect results"
        );
      }
      if (this.nCachedTokens + tokens.length > this.loadedContextInfo.n_ctx) {
        throw new WllamaError(
          "Running out of context cache. Please increase n_ctx when loading the model",
          "kv_cache_full"
        );
      }
      if (tokens.length > this.loadedContextInfo.n_batch) {
        throw new WllamaError(
          "Embedding tokens does not fit into batch. Please increase n_batch when loading the model",
          "inference_error"
        );
      }
      if (tokens.length > this.loadedContextInfo.n_ubatch) {
        throw new WllamaError(
          "Embedding tokens does not fit into physical batch. Please increase n_ubatch when loading the model",
          "inference_error"
        );
      }
      const result = yield this.proxy.wllamaAction(
        "embeddings",
        {
          _name: "gemb_req",
          tokens
        }
      );
      if (!result.success) {
        throw new WllamaError("embeddings unknown error");
      } else {
        return result.embeddings;
      }
    });
  }
  /**
   * Remove and shift some tokens from KV cache.
   * Keep n_keep, remove n_discard then shift the rest
   * @param nKeep
   * @param nDiscard
   */
  kvRemove(nKeep, nDiscard) {
    return __async(this, null, function* () {
      this.checkModelLoaded();
      if (nDiscard === 0) return;
      const result = yield this.proxy.wllamaAction(
        "kv_remove",
        {
          _name: "kvcr_req",
          n_keep: nKeep,
          n_discard: nDiscard
        }
      );
      if (!result.success) {
        throw new WllamaError("kvRemove unknown error");
      }
      if (nDiscard < 0) {
        this.nCachedTokens = nKeep;
      } else {
        this.nCachedTokens -= nDiscard;
      }
    });
  }
  /**
   * Clear all tokens in KV cache
   */
  kvClear() {
    return __async(this, null, function* () {
      this.checkModelLoaded();
      const result = yield this.proxy.wllamaAction(
        "kv_clear",
        {
          _name: "kvcc_req"
        }
      );
      if (!result.success) {
        throw new WllamaError("kvClear unknown error");
      }
      this.nCachedTokens = 0;
    });
  }
  /**
   * Save session to file (virtual file system)
   * TODO: add ability to download the file
   * @param filePath
   * @returns List of tokens saved to the file
   */
  // async sessionSave(filePath: string): Promise<{ tokens: number[] }> {
  //   this.checkModelLoaded();
  //   const result = await this.proxy.wllamaAction('session_save', {
  //     session_path: filePath,
  //   });
  //   return result;
  // }
  /**
   * Load session from file (virtual file system)
   * TODO: add ability to download the file
   * @param filePath
   */
  // async sessionLoad(filePath: string): Promise<void> {
  //   this.checkModelLoaded();
  //   const result = await this.proxy.wllamaAction('session_load', {
  //     session_path: filePath,
  //   });
  //   if (result.error) {
  //     throw new WllamaError(result.error);
  //   } else if (!result.success) {
  //     throw new WllamaError('sessionLoad unknown error');
  //   }
  //   const cachedTokens = await this.getCachedTokens();
  //   this.nCachedTokens = cachedTokens.length;
  // }
  /**
   * Apply chat template to a list of messages
   *
   * @param messages list of messages
   * @param addAssistant whether to add assistant prompt at the end
   * @param template (optional) custom template, see llama-server --chat-template argument for more details
   * @returns formatted chat
   */
  formatChat(messages, addAssistant, template) {
    return __async(this, null, function* () {
      this.checkModelLoaded();
      const roles = messages.map((m) => m.role);
      const contents = messages.map((m) => m.content);
      const result = yield this.proxy.wllamaAction(
        "chat_format",
        {
          _name: "cfmt_req",
          roles,
          contents,
          tmpl: template,
          add_ass: addAssistant
        }
      );
      if (!result.success) {
        throw new WllamaError("formatChat unknown error");
      }
      return result.formatted_chat;
    });
  }
  /**
   * Set options for underlaying llama_context
   */
  setOptions(opt) {
    return __async(this, null, function* () {
      this.checkModelLoaded();
      yield this.proxy.wllamaAction("set_options", __spreadValues({
        _name: "opti_req"
      }, opt));
      this.useEmbeddings = opt.embeddings;
    });
  }
  /**
   * Unload the model and free all memory.
   *
   * Note: This function will NOT crash if model is not yet loaded
   */
  exit() {
    return __async(this, null, function* () {
      var _a;
      yield (_a = this.proxy) == null ? void 0 : _a.wllamaExit();
      this.proxy = null;
    });
  }
  /**
   * get debug info
   */
  _getDebugInfo() {
    return __async(this, null, function* () {
      this.checkModelLoaded();
      return yield this.proxy.wllamaDebug();
    });
  }
  /**
   * benchmark function, only used internally
   */
  _testBenchmark(type, nSamples) {
    return __async(this, null, function* () {
      this.checkModelLoaded();
      return yield this.proxy.wllamaAction(
        "test_benchmark",
        {
          _name: "tben_req",
          type,
          n_samples: nSamples
        }
      );
    });
  }
  /**
   * perplexity function, only used internally
   */
  _testPerplexity(tokens) {
    return __async(this, null, function* () {
      this.checkModelLoaded();
      return yield this.proxy.wllamaAction(
        "test_perplexity",
        {
          _name: "tper_req",
          tokens
        }
      );
    });
  }
  ///// Prompt cache utils /////
  getCachedTokens() {
    return __async(this, null, function* () {
      this.checkModelLoaded();
      const result = yield this.proxy.wllamaAction(
        "current_status",
        {
          _name: "stat_req"
        }
      );
      return result.tokens;
    });
  }
  /**
   * Compare the input sequence and cachedToken, then return the part that is not in cache.
   * This function also remove mismatch part in cache (via kvRemove)
   */
  computeNonCachedTokens(seq) {
    return __async(this, null, function* () {
      const cachedTokens = yield this.getCachedTokens();
      let nKeep = 0;
      for (; nKeep < Math.min(cachedTokens.length, seq.length); nKeep++) {
        if (cachedTokens[nKeep] !== seq[nKeep]) {
          break;
        }
      }
      this.logger().debug(`Cache nKeep=${nKeep}`);
      try {
        yield this.kvRemove(nKeep, -1);
        return seq.slice(nKeep, seq.length);
      } catch (e) {
        this.logger().warn("Failed to rollback KV cache, clearing it instead");
        yield this.kvClear();
        return seq;
      }
    });
  }
  // TODO: add current_status
};
export {
  LoggerWithoutDebug,
  Model,
  ModelManager,
  ModelValidationStatus,
  POLYFILL_ETAG,
  Wllama,
  WllamaAbortError,
  WllamaError,
  isValidGgufFile
};
