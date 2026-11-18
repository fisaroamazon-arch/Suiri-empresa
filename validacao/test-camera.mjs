import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {JSDOM} from 'jsdom';

const ZXing = createRequire(import.meta.url)('../vendor/zxing.min.js');
const boleto = '00193373700000001000500940144816060680935031';
const pix = '00020126330014br.gov.bcb.pix0111+55000000005204000053039865802BR';

function amostraITF(numero) {
    const padroes = ['11331','31113','13113','33111','11313','31311','13311','11133','31131','13131'];
    const barras = [1,1,1,1];
    for (let i=0;i<numero.length;i+=2) {
        const preto=padroes[Number(numero[i])];
        const branco=padroes[Number(numero[i+1])];
        for (let j=0;j<5;j++) barras.push(Number(preto[j]),Number(branco[j]));
    }
    barras.push(3,1,1);
    const largura=(40+barras.reduce((s,n)=>s+n,0))*3;
    const altura=90;
    const pixels=new Uint8ClampedArray(largura*altura).fill(255);
    let inicio=60;
    barras.forEach((n,i)=>{
        const fim=inicio+n*3;
        if (i%2===0) for (let y=0;y<altura;y++) pixels.fill(0,y*largura+inicio,y*largura+fim);
        inicio=fim;
    });
    return new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(new ZXing.RGBLuminanceSource(pixels,largura,altura)));
}

const dom = new JSDOM(fs.readFileSync('index.html','utf8'),{url:'https://suiri.test/',runScripts:'outside-only'});
const win = dom.window;
try {
    const avisos=[];
    const el=id=>win.document.getElementById(id);
    let modo='ler';
    let parar=0;
    let resolverPermissao;
    const fluxo={getTracks:()=>[{readyState:'live',stop(){parar++;}}]};
    Object.defineProperty(win,'isSecureContext',{value:true,configurable:true});
    Object.defineProperty(win.navigator,'mediaDevices',{value:{
        async getUserMedia(opcoes) {
            assert.equal(opcoes.video.facingMode.ideal,'environment');
            if (modo==='recusar') throw new win.DOMException('Câmera recusada','NotAllowedError');
            if (modo==='aguardar') return new Promise(resolve=>{resolverPermissao=resolve;});
            return fluxo;
        }
    }});
    win.mostrarToast=(mensagem)=>avisos.push(mensagem);
    win.ZXing={...ZXing,BrowserMultiFormatReader:class {
        constructor(dicas){this.dicas=dicas;}
        async decodeFromStream(stream, video, callback) {
            if (modo==='pix') {
                assert.deepEqual([...this.dicas.get(ZXing.DecodeHintType.POSSIBLE_FORMATS)],[ZXing.BarcodeFormat.QR_CODE]);
                callback({getText:()=>'https://example.test'});
                assert.match(el('leitor-camera-status').textContent,/QR Code Pix/);
                callback({getText:()=>pix});
            } else {
                callback(new ZXing.MultiFormatReader().decode(amostraITF(boleto),this.dicas));
            }
        }
        reset(){}
    }};
    const ctx=dom.getInternalVMContext();
    new vm.Script(fs.readFileSync('app-gestao.js','utf8')).runInContext(ctx);
    await win.abrirLeitorCameraGestao();
    assert.equal(el('input-conta-codigo-gestao').value,boleto);
    assert.equal(el('box-leitor-camera-gestao').classList.contains('oculto'),true);
    assert.equal(parar,1);
    assert.match(avisos.at(-1),/Confira os dados/);
    assert.equal(vm.runInContext("normalizarCodigoConta('00190.50095 40144.816069 06809.350314 3 37370000000100','boleto')",ctx)?.length,47);
    assert.equal(vm.runInContext("normalizarCodigoConta('84670000001-7 43590024020-9 02405000243-5 84221010811-9','boleto')",ctx)?.length,48);
    assert.equal(vm.runInContext("normalizarCodigoConta('https://example.test/00193373700000001000500940144816060680935031','boleto')",ctx),null);
    modo='pix';
    el('select-conta-tipo-gestao').value='pix';
    win.alternarTipoContaGestao('pix');
    await win.abrirLeitorCameraGestao();
    assert.equal(el('input-conta-codigo-gestao').value,pix);
    assert.equal(el('input-conta-codigo-gestao').inputMode,'text');
    assert.equal(parar,2);

    modo='recusar';
    await win.abrirLeitorCameraGestao();
    assert.match(avisos.at(-1),/Permita o uso da câmera ou cole/);
    assert.equal(el('box-leitor-camera-gestao').classList.contains('oculto'),true);
    modo='aguardar';
    const abrindo=win.abrirLeitorCameraGestao();
    win.fecharLeitorCameraGestao();
    resolverPermissao(fluxo);
    await abrindo;
    assert.equal(parar,3);
    console.log('ZXing decodifica amostra ITF de 44 dígitos; preenchimento, formatos, Pix, permissão e liberação: PASS');
} finally {
    dom.window.close();
}
