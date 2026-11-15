// D-112: part ids with an aliased or missing model file must not cause a 404 probe.
import { describe, expect, it, vi } from 'vitest';
import { MODEL_ALIAS, loadModel, modelUrl } from './models';

describe('model aliases', () => {
  it('maps tank_s to its kit model and leaves other ids alone', () => {
    expect(modelUrl('tank_s')).toMatch(/models\/tank_s1_s\.glb$/);
    expect(modelUrl('eng_kerolox_workhorse')).toMatch(/models\/eng_kerolox_workhorse\.glb$/);
    expect(modelUrl('toString')).toMatch(/models\/toString\.glb$/);
  });

  it('never fetches a part that has no model yet', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    expect(MODEL_ALIAS.inst_wide_field_optical_camera).toBeNull();
    expect(await loadModel('inst_wide_field_optical_camera')).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
