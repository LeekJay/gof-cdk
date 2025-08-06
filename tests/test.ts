import axios from "axios";
import { DdddOcr } from "ddddocr-node";
import { generateSignedObject } from "../src/utils";
import { useLogger } from "../src/logger";

const logger = useLogger("test");

const ocr = new DdddOcr();

async function test() {
	const instance = axios.create({
		baseURL: "https://wjdr-giftcode-api.campfiregames.cn/api",
		headers: {
			Accept: "application/json, text/plain, */*",
			"User-Agent":
				"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
			"Content-Type": "application/x-www-form-urlencoded",
		},
		timeout: 20000,
	});

	const data = generateSignedObject(
		{ fid: "43451091", time: Date.now() },
		"Uiv#87#SPan.ECsp",
	);

	const playerInfo = await instance.post("/player", data);
	const captcha = await instance.post("/captcha", data);
	const captchaResult = await ocr.classification(captcha.data.data.img);
	const giftData = generateSignedObject(
		{
			fid: "43451091",
			cdk: "HAPPY61",
			captcha_code: captchaResult,
			time: Date.now(),
		},
		"Uiv#87#SPan.ECsp",
	);
	const giftResult = await instance.post("/gift_code", giftData);

	logger.info(playerInfo.data.data);
	logger.info(captchaResult);
	logger.info(giftResult.data);
}

test().finally(() => {
	logger.result("测试完成");
});
