import vertexShader from './shaders/pick.vert.glsl';
import fragmentShader from './shaders/frag.glsl';

import { RGBA } from '../types';
import { Column } from './column';
import { Program } from './program';
import { Scope } from '../components/scope';
import { debounce, lerpArrayValues, calcColumnHeight } from '../utils';

export class Picker {
    private gl: WebGLRenderingContext;
    private framebuffer: WebGLFramebuffer;
    private renderbuffer: WebGLRenderbuffer;

    private columns: Column[];

    private program: Program;
    private scope: Scope;
    private map: mapboxgl.Map;

    private pixels: Uint8Array;

    private width: number;
    private height: number;

    private valid: boolean;

    private debouncedRender: () => void;

    constructor(gl: WebGLRenderingContext, scope: Scope, map: mapboxgl.Map, columns: Column[]) {
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        const framebuffer = gl.createFramebuffer() as WebGLFramebuffer;
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);

        const renderbuffer = gl.createRenderbuffer() as WebGLRenderbuffer;
        gl.bindRenderbuffer(gl.RENDERBUFFER, renderbuffer);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, 0, 0);

        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
        gl.framebufferRenderbuffer(
            gl.FRAMEBUFFER,
            gl.DEPTH_ATTACHMENT,
            gl.RENDERBUFFER,
            renderbuffer,
        );

        gl.bindRenderbuffer(gl.RENDERBUFFER, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        this.program = new Program(
            gl,
            vertexShader,
            fragmentShader,
            ['position'],
            [
                { name: 'mvp', type: '4m' },
                { name: 'color', type: '4f' },
                { name: 'height', type: '1f' },
            ],
        );

        this.valid = false;

        this.width = 0;
        this.height = 0;
        this.pixels = new Uint8Array(0);

        this.gl = gl;
        this.map = map;
        this.scope = scope;
        this.framebuffer = framebuffer;
        this.renderbuffer = renderbuffer;

        this.columns = columns;

        this.map.on('mousemove', (e) => {
            const id = this.pick(e.point.x, e.point.y);

            if (id !== undefined) {
                this.map.getCanvas().style.cursor = 'pointer';
            } else {
                this.map.getCanvas().style.cursor = 'default';
            }
        });

        this.debouncedRender = debounce(this.render, 50);
    }

    public setSize(width: number, height: number): void {
        const { gl } = this;

        this.width = width;
        this.height = height;
        this.pixels = new Uint8Array(width * height * 4);

        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

        gl.bindRenderbuffer(gl.RENDERBUFFER, this.renderbuffer);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height);
        gl.bindRenderbuffer(gl.RENDERBUFFER, null);

        this.update();
    }

    public pick(x: number, y: number): Column | undefined {
        const { pixels, valid, width, height } = this;

        if (!valid) {
            return undefined;
        }

        const offset = ((height - y) * width + x) * 4;
        const id = this.colorToId(pixels[offset], pixels[offset + 1], pixels[offset + 2]);

        return id !== undefined ? this.columns[id] : undefined;
    }

    public update(): void {
        this.valid = false;

        this.debouncedRender();
    }

    private render = (): void => {
        const { gl, scope, program, framebuffer } = this;

        const mvp = scope.getMvp();

        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        program.use();

        gl.viewport(0, 0, this.width, this.height);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        program.bindUniform('mvp', ...mvp);

        for (const column of this.columns) {
            const values = column.region.rows[this.scope.getRow()];
            const value = lerpArrayValues(values, this.scope.getDay());

            if (value === 0) {
                continue;
            }

            program.bindAttribute('position', column.positionBuffer);
            program.bindUniform('color', ...this.idToColor(column.id));
            program.bindUniform('height', calcColumnHeight(value));

            gl.drawArrays(gl.TRIANGLES, 0, column.vertexCount);
        }

        gl.readPixels(0, 0, this.width, this.height, gl.RGBA, gl.UNSIGNED_BYTE, this.pixels);

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        this.valid = true;
    };

    private idToColor(id: number): RGBA {
        id = id + 1;
        const b = id & 0xff;
        const g = (id >> 8) & 0xff;
        const r = (id >> 16) & 0xff;

        return [r / 255, g / 255, b / 255, 1];
    }

    private colorToId(r: number, g: number, b: number): number | undefined {
        const id = (r << 16) | (g << 8) | b;

        if (id === 0) {
            return undefined;
        }

        return id - 1;
    }
}
