// 全局变量
var gl;				// WebGL上下文
var program; 		// shader program

var mvStack = [];  // 模视投影矩阵栈，用数组实现，初始为空
var matCamera = mat4();	 // 照相机变换，初始为恒等矩阵
var matReverse = mat4(); // 照相机变换的逆变换，初始为恒等矩阵
var matProj;  // 投影矩阵

var yRot = 0.0;        // 用于动画的旋转角
var deltaAngle = 60.0; // 每秒旋转角度

// 用于保存W、S、A、D四个方向键的按键状态的数组
var keyDown = [false, false, false, false];

var g = 9.8;				// 重力加速度
var initSpeed = 4; 			// 初始速度 
var jumping = false;	    // 是否处于跳跃过程中
var jumpY = 0;          	// 当前跳跃的高度
var jumpTime = 0;			// 从跳跃开始经历的时间

//光源对象
//构造函数，各属性有默认值
var Light = function () {
	//光源位置/方向（默认为斜上方方向光源）
	this.pos = vec4(1.0, 1.0, 1.0, 0.0);
};

// 定义Obj对象
// 构造函数
var Obj = function () {
	this.numVertices = 0; 		// 顶点个数
	this.vertices = new Array(0); // 用于保存顶点数据的数组
	this.vertexBuffer = null;	// 存放顶点数据的buffer对象
	this.color = vec3(1.0, 1.0, 1.0); // 对象颜色，默认为白色
};

// 初始化缓冲区对象(VBO)
Obj.prototype.initBuffers = function () {
	/*创建并初始化顶点坐标缓冲区对象(Buffer Object)*/
	// 创建缓冲区对象，存于成员变量vertexBuffer中
	this.vertexBuffer = gl.createBuffer();
	// 将vertexBuffer绑定为当前Array Buffer对象
	gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
	// 为Buffer对象在GPU端申请空间，并提供数据
	gl.bufferData(gl.ARRAY_BUFFER,	// Buffer类型
		flatten(this.vertices),		// 数据来源
		gl.STATIC_DRAW	// 表明是一次提供数据，多遍绘制
	);
	// 顶点数据已传至GPU端，可释放内存
	this.vertices.length = 0;
}

// 绘制几何对象
// 参数为模视矩阵
Obj.prototype.draw = function (matMV) {
	// 设置为a_Position提供数据的方式
	gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
	// 为顶点属性数组提供数据(数据存放在vertexBuffer对象中)
	gl.vertexAttribPointer(
		program.a_Position,	// 属性变量索引
		3,					// 每个顶点属性的分量个数
		gl.FLOAT,			// 数组数据类型
		false,				// 是否进行归一化处理
		0,   // 在数组中相邻属性成员起始位置间的间隔(以字节为单位)
		0    // 第一个属性值在buffer中的偏移量
	);
	// 为a_Position启用顶点数组
	gl.enableVertexAttribArray(program.a_Position);

	// 传颜色
	gl.uniform3fv(program.u_Color, flatten(this.color));

	// 开始绘制
	gl.uniformMatrix4fv(program.u_ModelView, false,
		flatten(matMV)); // 传MV矩阵
	gl.uniformMatrix3fv(program.NormalMat, false,
		flatten(normalMatrix(matMV))); // 传法向矩阵
	gl.drawArrays(gl.TRIANGLES, 0, this.numVertices);
}

// 在y=0平面绘制中心在原点的格状方形地面
// fExtent：决定地面区域大小(方形地面边长的一半)
// fStep：决定线之间的间隔
// 返回地面Obj对象
function buildGround(fExtent, fStep) {
	var obj = new Obj(); // 新建一个Obj对象
	for (var x = -fExtent; x < fExtent; x += fStep) {
		for (var z = fExtent; z > -fExtent; z -= fStep) {
			// 以(x, 0, z)为左下角的单元四边形的4个顶点
			var ptLowerLeft = vec3(x, 0, z);
			var ptLowerRight = vec3(x + fStep, 0, z);
			var ptUpperLeft = vec3(x, 0, z - fStep);
			var ptUpperRight = vec3(x + fStep, 0, z - fStep);

			// 分成2个三角形
			obj.vertices.push(ptUpperLeft);
			obj.vertices.push(ptLowerLeft);
			obj.vertices.push(ptLowerRight);
			obj.vertices.push(ptUpperLeft);
			obj.vertices.push(ptLowerRight);
			obj.vertices.push(ptUpperRight);

			obj.numVertices += 6;
		}
	}

	return obj;
}

// 用于生成一个中心在原点的球的顶点数据(南北极在z轴方向)
// 返回球Obj对象，参数为球的半径及经线和纬线数
function buildSphere(radius, columns, rows) {
	var obj = new Obj(); // 新建一个Obj对象
	var vertices = []; // 存放不同顶点的数组

	for (var r = 0; r <= rows; r++) {
		var v = r / rows;  // v在[0,1]区间
		var theta1 = v * Math.PI; // theta1在[0,PI]区间

		var temp = vec3(0, 0, 1);
		var n = vec3(temp); // 实现Float32Array深拷贝
		var cosTheta1 = Math.cos(theta1);
		var sinTheta1 = Math.sin(theta1);
		n[0] = temp[0] * cosTheta1 + temp[2] * sinTheta1;
		n[2] = -temp[0] * sinTheta1 + temp[2] * cosTheta1;

		for (var c = 0; c <= columns; c++) {
			var u = c / columns; // u在[0,1]区间
			var theta2 = u * Math.PI * 2; // theta2在[0,2PI]区间
			var pos = vec3(n);
			temp = vec3(n);
			var cosTheta2 = Math.cos(theta2);
			var sinTheta2 = Math.sin(theta2);

			pos[0] = temp[0] * cosTheta2 - temp[1] * sinTheta2;
			pos[1] = temp[0] * sinTheta2 + temp[1] * cosTheta2;

			var posFull = mult(pos, radius);

			vertices.push(posFull);
		}
	}

	/*生成最终顶点数组数据(使用三角形进行绘制)*/
	var colLength = columns + 1;
	for (var r = 0; r < rows; r++) {
		var offset = r * colLength;

		for (var c = 0; c < columns; c++) {
			var ul = offset + c;						// 左上
			var ur = offset + c + 1;					// 右上
			var br = offset + (c + 1 + colLength);	// 右下
			var bl = offset + (c + 0 + colLength);	// 左下

			// 由两条经线和纬线围成的矩形
			// 分2个三角形来画
			obj.vertices.push(vertices[ul]);
			obj.vertices.push(vertices[bl]);
			obj.vertices.push(vertices[br]);
			obj.vertices.push(vertices[ul]);
			obj.vertices.push(vertices[br]);
			obj.vertices.push(vertices[ur]);
		}
	}

	vertices.length = 0; // 已用不到，释放 
	obj.numVertices = rows * columns * 6; // 顶点数

	return obj;
}

// 构建中心在原点的圆环(由线段构建)
// 参数分别为圆环的主半径(决定环的大小)，
// 圆环截面圆的半径(决定环的粗细)，
// numMajor和numMinor决定模型精细程度
// 返回圆环Obj对象
function buildTorus(majorRadius, minorRadius, numMajor, numMinor) {
	var obj = new Obj(); // 新建一个Obj对象

	obj.numVertices = numMajor * numMinor * 6; // 顶点数

	var majorStep = 2.0 * Math.PI / numMajor;
	var minorStep = 2.0 * Math.PI / numMinor;

	for (var i = 0; i < numMajor; ++i) {
		var a0 = i * majorStep;
		var a1 = a0 + majorStep;
		var x0 = Math.cos(a0);
		var y0 = Math.sin(a0);
		var x1 = Math.cos(a1);
		var y1 = Math.sin(a1);

		for (var j = 0; j < numMinor; ++j) {
			var b0 = j * minorStep;
			var b1 = b0 + minorStep;
			var c0 = Math.cos(b0);
			var r0 = minorRadius * c0 + majorRadius;
			var z0 = minorRadius * Math.sin(b0);
			var c1 = Math.cos(b1);
			var r1 = minorRadius * c1 + majorRadius;
			var z1 = minorRadius * Math.sin(b1);

			var left0 = vec3(x0 * r0, y0 * r0, z0);
			var right0 = vec3(x1 * r0, y1 * r0, z0);
			var left1 = vec3(x0 * r1, y0 * r1, z1);
			var right1 = vec3(x1 * r1, y1 * r1, z1);
			obj.vertices.push(left0);
			obj.vertices.push(right0);
			obj.vertices.push(left1);
			obj.vertices.push(left1);
			obj.vertices.push(right0);
			obj.vertices.push(right1);
		}
	}

	return obj;
}

// 获取shader中变量位置
function getLocation() {
	/*获取shader中attribute变量的位置(索引)*/
	program.a_Position = gl.getAttribLocation(program, "a_Position");
	if (program.a_Position < 0) { // getAttribLocation获取失败则返回-1
		console.log("获取attribute变量a_Position失败！");
	}
	program.a_Normal = gl.getAttribLocation(program, "a_Normal");
	if (program.a_Normal < 0) {
		console.log("获取attribute变量a_Normal失败！");
	}
	/*获取shader中uniform变量的位置(索引)*/
	program.u_ModelView = gl.getUniformLocation(program, "u_ModelView");
	if (!program.u_ModelView) { // getUniformLocation获取失败则返回null
		console.log("获取uniform变量u_ModelView失败！");
	}

	program.u_Projection = gl.getUniformLocation(program, "u_Projection");
	if (!program.u_Projection) { // getUniformLocation获取失败则返回null
		console.log("获取uniform变量u_Projection失败！");
	}

	program.u_NormalMat = gl.getUniformLocation(program, "u_NormalMat");
	if (!program.u_NormalMat) {
		console.log("获取uniform变量u_NormalMat失败！");
	}

	program.LightPositions = gl.getUniformLocation(program, "u_LightPosition");
	if (!program.u_LightPosition) {
		console.log("获取uniform变量u_LightPosition失败！");
	}

	program.u_Shininess = gl.getUniformLocation(program, "u_Shininess");
	if (!program.u_Shininess) {
		console.log("获取uniform变量u_Shininess失败！");
	}

	program.u_AmbientProduct = gl.getUniformLocation(program, "u_AmbientProduct");
	if (!program.u_AmbientProduct) {
		console.log("获取uniform变量u_AmbientProduct失败！");
	}

	program.u_DiffuseProduct = gl.getUniformLocation(program, "u_DiffuseProduct");
	if (!program.u_DiffuseProduct) {
		console.log("获取uniform变量u_DiffuseProduct失败！");
	}

	program.u_SpecularProduct = gl.getUniformLocation(program, "u_SpecularProduct");
	if (!program.u_SpecularProduct) {
		console.log("获取uniform变量u_SpecularProduct失败！");
	}
}

var ground = buildGround(20.0, 1.0); // 生成地面对象

var numSpheres = 50;  // 场景中球的数目
// 用于保存球位置的数组，对每个球位置保存其x、z坐标
var posSphere = [];
var sphere = buildSphere(0.2, 15, 15); // 生成球对象

var torus = buildTorus(0.35, 0.15, 40, 20); // 生成圆环对象

// 初始化场景中的几何对象
function initObjs() {
	// 初始化地面顶点数据缓冲区对象(VBO)
	ground.initBuffers();

	var sizeGround = 20;
	// 随机放置球的位置
	for (var iSphere = 0; iSphere < numSpheres; iSphere++) {
		// 在 -sizeGround 和 sizeGround 间随机选择一位置
		var x = Math.random() * sizeGround * 2 - sizeGround;
		var z = Math.random() * sizeGround * 2 - sizeGround;
		posSphere.push(vec2(x, z));
	}

	// 初始化球顶点数据缓冲区对象(VBO)
	sphere.initBuffers();

	// 初始化圆环顶点数据缓冲区对象(VBO)
	torus.initBuffers();
}


// 页面加载完成后会调用此函数，函数名可任意(不一定为main)
window.onload = function main() {
	// 获取页面中id为webgl的canvas元素
	var canvas = document.getElementById("webgl");
	if (!canvas) { // 获取失败？
		alert("获取canvas元素失败！");
		return;
	}

	// 利用辅助程序文件中的功能获取WebGL上下文
	// 成功则后面可通过gl来调用WebGL的函数
	gl = WebGLUtils.setupWebGL(canvas);
	if (!gl) { // 失败则弹出信息
		alert("获取WebGL上下文失败！");
		return;
	}

	/*设置WebGL相关属性*/
	gl.clearColor(0.0, 0.0, 0.5, 1.0); // 设置背景色为蓝色
	gl.enable(gl.DEPTH_TEST);	// 开启深度检测
	gl.enable(gl.CULL_FACE);	// 开启面剔除
	// 设置视口，占满整个canvas
	gl.viewport(0, 0, canvas.width, canvas.height);

	/*加载shader程序并为shader中attribute变量提供数据*/
	// 加载id分别为"vertex-shader"和"fragment-shader"的shader程序，
	// 并进行编译和链接，返回shader程序对象program
	program = initShaders(gl, "vertex-shader",
		"fragment-shader");
	gl.useProgram(program);	// 启用该shader程序对象 

	// 获取shader中变量位置
	getLocation();

	// 设置投影矩阵：透视投影，根据视口宽高比指定视域体
	var matProj = perspective(35.0, 		// 垂直方向视角
		canvas.width / canvas.height, 	// 视域体宽高比
		0.1, 							// 相机到近裁剪面距离
		50.0);							// 相机到远裁剪面距离

	//传投影矩阵
	gl.uniformMatrix4fv(program.u_Projection, false, flatten(matProj));
	// 初始化场景中的几何对象
	initObjs();

	// 进行绘制
	render();
};

// 按键响应
window.onkeydown = function () {
	switch (event.keyCode) {
		case 38:	// Up
			matReverse = mult(matReverse, translate(0.0, 0.0, -0.1));
			matCamera = mult(translate(0.0, 0.0, 0.1), matCamera);
			break;
		case 40:	// Down
			matReverse = mult(matReverse, translate(0.0, 0.0, -0.1));
			matCamera = mult(translate(0.0, 0.0, -0.1), matCamera);
			break;
		case 37:	// Left
			matReverse = mult(matReverse, rotateY(1));
			matCamera = mult(rotateY(-1), matCamera);
			break;
		case 39:	// Right
			matReverse = mult(matReverse, rotateY(-1));
			matCamera = mult(rotateY(1), matCamera);
			break;
		case 87:	// W
			keyDown[0] = true;
			break;
		case 83:	// S
			keyDown[1] = true;
			break;
		case 65:	// A
			keyDown[2] = true;
			break;
		case 68:	// D
			keyDown[3] = true;
			break;
		case 32: 	// space
			if (!jumping) {
				jumping = true;
				jumpTime = 0;
			}
			break;
	}
	// 禁止默认处理(例如上下方向键对滚动条的控制)
	event.preventDefault();
	//console.log("%f, %f, %f", matReverse[3], matReverse[7], matReverse[11]);
}

// 按键弹起响应
window.onkeyup = function () {
	switch (event.keyCode) {
		case 87:	// W
			keyDown[0] = false;
			break;
		case 83:	// S
			keyDown[1] = false;
			break;
		case 65:	// A
			keyDown[2] = false;
			break;
		case 68:	// D
			keyDown[3] = false;
			break;
	}
}

// 记录上一次调用函数的时刻
var last = Date.now();

// 根据时间更新旋转角度
function animation() {
	// 计算距离上次调用经过多长的时间
	var now = Date.now();
	var elapsed = (now - last) / 1000.0; // 秒
	last = now;

	// 更新动画状态
	yRot += deltaAngle * elapsed;

	// 防止溢出
	yRot %= 360;

	// 跳跃处理
	jumpTime += elapsed;
	if (jumping) {
		jumpY = initSpeed * jumpTime - 0.5 * g * jumpTime * jumpTime;
		if (jumpY <= 0) {
			jumpY = 0;
			jumping = false;
		}
	}
}

// 更新照相机变换
function updateCamera() {
	// 照相机前进
	if (keyDown[0]) {
		matReverse = mult(matReverse, translate(0.0, 0.0, -0.1));
		matCamera = mult(translate(0.0, 0.0, 0.1), matCamera);
	}

	// 照相机后退
	if (keyDown[1]) {
		matReverse = mult(matReverse, translate(0.0, 0.0, 0.1));
		matCamera = mult(translate(0.0, 0.0, -0.1), matCamera);
	}

	// 照相机左转
	if (keyDown[2]) {
		matReverse = mult(matReverse, rotateY(1));
		matCamera = mult(rotateY(-1), matCamera);
	}

	// 照相机右转
	if (keyDown[3]) {
		matReverse = mult(matReverse, rotateY(-1));
		matCamera = mult(rotateY(1), matCamera);
	}
}

// 绘制函数
function render() {
	animation(); // 更新动画参数

	updateCamera(); // 更新相机变换

	// 清颜色缓存和深度缓存
	gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

	// 模视矩阵初始化为照相机变换矩阵
	var matMV = mult(translate(0, -jumpY, 0), matCamera);

	/*绘制地面*/
	mvStack.push(matMV);
	// 将地面移到y=-0.4平面上
	matMV = mult(matMV, translate(0.0, -0.4, 0.0));
	ground.draw(matMV);
	matMV = mvStack.pop();

	/*绘制每个球体*/
	for (var i = 0; i < numSpheres; i++) {
		mvStack.push(matMV);
		matMV = mult(matMV, translate(posSphere[i][0],
			-0.2, posSphere[i][1])); // 平移到相应位置
		matMV = mult(matMV, rotateX(90)); // 调整南北极
		sphere.draw(matMV);
		matMV = mvStack.pop();
	}

	// 将后面的模型往-z轴方向移动
	// 使得它们位于摄像机前方(也即世界坐标系原点前方)
	matMV = mult(matMV, translate(0.0, 0.0, -2.5));

	/*绘制绕原点旋转的球*/
	mvStack.push(matMV); // 使得下面对球的变换不影响后面绘制的圆环
	// 调整南北极后先旋转再平移
	matMV = mult(matMV, rotateY(-yRot * 2.0));
	matMV = mult(matMV, translate(1.0, 0.0, 0.0));
	matMV = mult(matMV, rotateX(90)); // 调整南北极
	sphere.draw(matMV);
	matMV = mvStack.pop();

	/*绘制自转的圆环*/
	matMV = mult(matMV, translate(0.0, 0.1, 0.0));
	matMV = mult(matMV, rotateY(yRot));
	torus.draw(matMV);

	requestAnimFrame(render); // 请求重绘
}