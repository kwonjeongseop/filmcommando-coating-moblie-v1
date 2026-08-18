// TF.js coco-ssd 물체 감지 — 지연 로드 + 문서류 클래스 판별
// TF.js coco-ssd가 감지하는 80개 클래스 중 "문서"로 취급할 클래스 — 이 클래스가 감지되면 강조 표시하고
// OpenCV 엣지감지의 관심영역(ROI) 힌트로 사용한다.
export const DOC_CLASSES = new Set(['book', 'laptop', 'cell phone', 'remote']);

/* TF.js(tfjs-core + tfjs-converter + tfjs-backend-webgl) + coco-ssd(lite_mobilenet_v2, 가장 가벼운 변형)
   모델을 지연 로드한다 — 카메라를 열 때만 동적 import하며, 세션이 끝나면(카메라를 닫으면) 호출부에서
   model.dispose()로 해제하므로 모듈 레벨에 캐시하지 않는다(라이브러리 자체의 동적 import는 브라우저/
   모듈 시스템이 알아서 캐시함). 모델 가중치(~14MB)는 최초 1회만 네트워크로 받아오고 이후엔 브라우저
   캐시를 탄다. 로드 실패(오프라인 등)는 호출부에서 catch해 OpenCV만으로 계속 동작한다. */
export async function loadCocoSsdModel() {
  const tf = await import('@tensorflow/tfjs-core');
  await import('@tensorflow/tfjs-converter');
  await import('@tensorflow/tfjs-backend-webgl');
  await import('@tensorflow/tfjs-backend-cpu'); // coco-ssd 내부 일부 연산(NMS 등)이 cpu 백엔드 등록을 필요로 함
  await tf.setBackend('webgl');
  await tf.ready();
  const cocoSsd = await import('@tensorflow-models/coco-ssd');
  const t0 = performance.now();
  const model = await cocoSsd.load({ base: 'lite_mobilenet_v2' });
  console.log('[TFJS] coco-ssd 모델 로드 완료 · ' + Math.round(performance.now() - t0) + 'ms');
  return model;
}
