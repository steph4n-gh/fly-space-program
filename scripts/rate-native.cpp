// The same complete CSR rate update as dist/full-network.js. No pruning,
// sparsity shortcuts, altered precision, approximation, or changed addition order within a neuron.
#include <node_api.h>
#include <cmath>
#include <cstdint>

struct Array { void* data; size_t length; };
bool array(napi_env env, napi_value value, napi_typedarray_type expected, Array& out) {
  napi_typedarray_type type; napi_value buffer; size_t offset;
  if (napi_get_typedarray_info(env, value, &type, &out.length, &out.data, &buffer, &offset) != napi_ok || type != expected) {
    napi_throw_type_error(env, nullptr, "Unexpected neural array type"); return false;
  }
  return true;
}
napi_value step(napi_env env, napi_callback_info info) {
  size_t argc=12; napi_value args[12];
  if (napi_get_cb_info(env,info,&argc,args,nullptr,nullptr)!=napi_ok || argc!=12) {
    napi_throw_type_error(env,nullptr,"Expected eleven arrays and one gain"); return nullptr;
  }
  const napi_typedarray_type types[]={napi_uint32_array,napi_uint16_array,napi_uint32_array,napi_float32_array,napi_int8_array,napi_int16_array,napi_int8_array,napi_float32_array,napi_float32_array,napi_float32_array,napi_float64_array};
  Array a[11]; for(size_t i=0;i<11;i++)if(!array(env,args[i],types[i],a[i]))return nullptr;
  const size_t n=a[7].length; double gain;
  if(napi_get_value_double(env,args[11],&gain)!=napi_ok || !std::isfinite(gain) || gain<1 || gain>1.05 || a[0].length!=a[1].length || a[2].length!=n+1) {
    napi_throw_range_error(env,nullptr,"Invalid neural graph shape or gain");return nullptr;
  }
  for(size_t i=3;i<10;i++)if(a[i].length!=n){napi_throw_range_error(env,nullptr,"Invalid neural state length");return nullptr;}
  const auto* pre=static_cast<const uint32_t*>(a[0].data);
  const auto* weight=static_cast<const uint16_t*>(a[1].data);
  const auto* rows=static_cast<const uint32_t*>(a[2].data);
  const auto* normalizer=static_cast<const float*>(a[3].data);
  const auto* signs=static_cast<const int8_t*>(a[4].data);
  const auto* channels=static_cast<const int16_t*>(a[5].data);
  const auto* polarity=static_cast<const int8_t*>(a[6].data);
  const auto* activity=static_cast<const float*>(a[7].data);
  auto* next=static_cast<float*>(a[8].data);
  auto* signedActivity=static_cast<float*>(a[9].data);
  const auto* obs=static_cast<const double*>(a[10].data);
  if(rows[0]!=0 || rows[n]!=a[0].length){napi_throw_range_error(env,nullptr,"Invalid CSR boundaries");return nullptr;}
  for(size_t i=0;i<n;i++)signedActivity[i]=activity[i]*signs[i];
  for(size_t i=0;i<n;i+=2){
    const bool paired=i+1<n;
    size_t e0=rows[i],end0=rows[i+1],e1=end0,end1=paired?rows[i+2]:end0;
    if(e0>end0 || end0>end1 || end1>a[0].length){napi_throw_range_error(env,nullptr,"Invalid CSR row");return nullptr;}
    const size_t common=(end0-e0<end1-e1)?end0-e0:end1-e1;
    double sum0=0,sum1=0;
    // Overlap two adjacent, independent sums without sorting graph rows.
    for(size_t k=0;k<common;k++){
      const size_t source0=pre[e0],source1=pre[e1];
      if(source0>=n || source1>=n){napi_throw_range_error(env,nullptr,"Invalid neural source");return nullptr;}
      sum0+=double(weight[e0++])*double(signedActivity[source0]);
      sum1+=double(weight[e1++])*double(signedActivity[source1]);
    }
    for(;e0<end0;e0++){
      const size_t source=pre[e0];
      if(source>=n){napi_throw_range_error(env,nullptr,"Invalid neural source");return nullptr;}
      sum0+=double(weight[e0])*double(signedActivity[source]);
    }
    for(;e1<end1;e1++){
      const size_t source=pre[e1];
      if(source>=n){napi_throw_range_error(env,nullptr,"Invalid neural source");return nullptr;}
      sum1+=double(weight[e1])*double(signedActivity[source]);
    }
    for(size_t j=0;j<(paired?2:1);j++){
      const size_t row=i+j;const double sum=j?sum1:sum0;const int channel=channels[row];
      const double observation=channel>=0 && size_t(channel)<a[10].length?obs[channel]:0;
      const double drive=channel>=0?.7*std::tanh(observation*.15)*polarity[row]:0;
      next[row]=float(std::tanh((double(activity[row])*.05+sum*double(normalizer[row])+drive)*gain));
    }
  }
  napi_value result;napi_get_undefined(env,&result);return result;
}
napi_value init(napi_env env,napi_value exports){
  napi_value function;napi_create_function(env,"step",4,step,nullptr,&function);napi_set_named_property(env,exports,"step",function);return exports;
}
NAPI_MODULE(rate_native,init)
