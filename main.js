import * as glutils from './utils.js';

var wc = document.getElementById('wc');
var ww = document.getElementById('ww');

var frontCanvas = document.getElementById('canvas');
var canvas = document.createElement('canvas');
var gl = canvas.getContext('webgl');
var program;

wc.oninput = ww.oninput = function (e) {
  console.log(wc.value, ww.value);
};

var pixelData;
var width;
var height;
var defaultWc;
var defaultWw;
var slope;
var intercept;

function main() {
  var image = new Image();
  // image.src = '/image.jpg';
  // image.src = '/bill.png';
  // image.onload = function () {
  //   render(image);
  // };

  fetch('/MG.dcm').then(response => {
    console.log('image loaded');
    response.arrayBuffer().then(buffer => {
      console.log('got buffer', buffer);
      var byteArray = new Uint8Array(buffer);
      var dataSet = dicomParser.parseDicom(byteArray);
      console.log('dataset', dataSet);

      var studyInstanceUid = dataSet.string('x0020000d');
      console.log('study', studyInstanceUid);

      // get the pixel data element (contains the offset and length of the data)
      var pixelDataElement = dataSet.elements.x7fe00010;

      // create a typed array on the pixel data (this example assumes 16 bit signed data)
      pixelData = new Int16Array(
        dataSet.byteArray.buffer,
        pixelDataElement.dataOffset,
        pixelDataElement.length / 2
      );

      height = dataSet.uint16('x00280010');
      width = dataSet.uint16('x00280011');
      defaultWc = dataSet.floatString('x00281050');
      defaultWw = dataSet.floatString('x00281051');
      intercept = dataSet.floatString('x00281052');
      slope = dataSet.floatString('x00281053');
      console.log('rows/cols', height, width);
      console.log('wc/ww', defaultWc, defaultWw);
      console.log('slope/intercept', slope, intercept);

      wc.value = defaultWc;
      ww.value = defaultWw;

      // height = 512;
      // width = 512;

      frontCanvas.style.width = width + 'px';
      frontCanvas.style.height = height + 'px';

      initialize();
      render();
    });
  });
}

function initialize() {
  console.time('initialization');

  canvas.width = width;
  canvas.height = height;

  var vertexShaderSource = document.getElementById('vs').text;
  var fragmentShaderSource = document.getElementById('fs').text;
  var vertexShader = glutils.createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
  var fragmentShader = glutils.createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
  program = glutils.createProgram(gl, vertexShader, fragmentShader);

  // Pack int16 into three uint8 channels (r, g, b)
  const data = new Uint8Array(width * height * 3);

  let off = 0;
  for (let i = 0; i < pixelData.length; i++) {
    const val = Math.abs(pixelData[i]);
    data[off++] = val & 0xff;
    data[off++] = val >> 8;
    data[off++] = pixelData[i] < 0 ? 0 : 1; // 0 For negative, 1 for positive
  }

  // create texture data from pixel data
  var texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);

  const level = 0;
  const format = gl.RGB;
  const border = 0;
  gl.texImage2D(
    gl.TEXTURE_2D,
    level,
    format,
    width,
    height,
    border,
    format,
    gl.UNSIGNED_BYTE,
    data
  );

  console.timeEnd('initialization');
}

function render() {
  // declare attributes and uniforms
  var positionLocation = gl.getAttribLocation(program, 'a_position');
  var texcoordLocation = gl.getAttribLocation(program, 'a_texCoord');

  // set a rectangle the same size as the image
  var positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  glutils.setRectangle(gl, 0, 0, width, height);

  // provide texture coordinates for the rectangle
  var texcoordBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, texcoordBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0, 1.0, 1.0]),
    gl.STATIC_DRAW
  );

  // set the filtering so we don't need mips and it's not filtered
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

  // lookup uniforms
  var resolutionLocation = gl.getUniformLocation(program, 'u_resolution');
  var wwLocation = gl.getUniformLocation(program, 'u_ww');
  var wcLocation = gl.getUniformLocation(program, 'u_wc');
  var slopeLocation = gl.getUniformLocation(program, 'u_slope');
  var interceptLocation = gl.getUniformLocation(program, 'u_intercept');
  var invertLocation = gl.getUniformLocation(program, 'u_invert');
  // glutils.resizeCanvas(gl.canvas);

  // tell how to map clip-space into screen-space
  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

  // enable the position attribute
  gl.enableVertexAttribArray(positionLocation);
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  var size = 2; // 2 components per iteration
  var type = gl.FLOAT; // the data is 32bit floats
  var normalize = false; // don't normalize the data
  var stride = 0; // 0 = move forward size * sizeof(type) each iteration to get the next position
  var offset = 0; // start at the beginning of the buffer
  gl.vertexAttribPointer(positionLocation, size, type, normalize, stride, offset);

  // turn on the texcoord attribute
  gl.enableVertexAttribArray(texcoordLocation);

  gl.bindBuffer(gl.ARRAY_BUFFER, texcoordBuffer);
  var size = 2; // 2 components per iteration
  var type = gl.FLOAT; // the data is 32bit floats
  var normalize = false; // don't normalize the data
  var stride = 0; // 0 = move forward size * sizeof(type) each iteration to get the next position
  var offset = 0; // start at the beginning of the buffer
  gl.vertexAttribPointer(texcoordLocation, size, type, normalize, stride, offset);

  // Clear the canvas
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.viewport(0, 0, width, height);
  gl.useProgram(program);

  // set the resolution
  gl.uniform2f(resolutionLocation, gl.canvas.width, gl.canvas.height);
  gl.uniform1f(wcLocation, wc.value);
  gl.uniform1f(wwLocation, ww.value);
  gl.uniform1f(slopeLocation, slope);
  gl.uniform1f(interceptLocation, intercept);
  gl.uniform1i(invertLocation, 0);

  // draw the rectangle
  var primitiveType = gl.TRIANGLES;
  var offset = 0;
  var count = 6;
  gl.drawArrays(primitiveType, offset, count);

  var ctx = frontCanvas.getContext('2d');
  ctx.drawImage(canvas, 0, 0, width, height);

  requestAnimationFrame(render);
}

main();
